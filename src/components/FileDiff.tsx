import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Copy } from 'lucide-react'
import { Diff, Hunk, getChangeKey, pickRanges, tokenize, type ChangeData, type HunkData, type TokenNode } from 'react-diff-view'
import refractor from 'refractor/core'
import bash from 'refractor/lang/bash.js'
import css from 'refractor/lang/css.js'
import go from 'refractor/lang/go.js'
import json from 'refractor/lang/json.js'
import jsx from 'refractor/lang/jsx.js'
import markup from 'refractor/lang/markup.js'
import python from 'refractor/lang/python.js'
import rust from 'refractor/lang/rust.js'
import sql from 'refractor/lang/sql.js'
import tsx from 'refractor/lang/tsx.js'
import yaml from 'refractor/lang/yaml.js'
import type { DiffFile } from '../lib/parseDiff'
import { makeRangeSnippet, makeSnippet, rangeChanges, type Pos } from '../lib/snippet'
import { useStore, type Comment } from '../store'
import { CommentForm } from './CommentForm'
import { CommentView } from './CommentView'
import { changeAt, lineOf, resolveClick } from './util'
import { countFileMatches, getSearchRanges, getTokenRanges, tokenAt } from '../lib/diffSearch'
import { countLineChanges } from '../lib/diffStats'
import { copyTextToClipboard } from '../lib/clipboard'

for (const grammar of [bash, css, go, json, jsx, markup, python, rust, sql, tsx, yaml]) refractor.register(grammar)

interface Props {
  file: DiffFile
  candidateId: string
  comments: Comment[]
  viewType: 'split' | 'unified'
  openAll: { open: boolean; version: number }
  query: string
  hoveredWord?: string
  selectedText?: string
  onHoverWord(word?: string): void
}

const badge = (f: DiffFile) =>
  f.isBinary ? 'binary' : f.isNew ? 'new file' : f.isDeleted ? 'deleted' : f.isRenamed ? `renamed from ${f.oldPath}` : ''

const toDiffHunks = (hunks: DiffFile['raw']['hunks']): HunkData[] => {
  // SAFETY: parser hunks and react-diff-view hunks contain the same diff change records.
  return hunks as unknown as HunkData[]
}

const languageFor = (path: string) => ({
  ts: 'tsx', tsx: 'tsx', js: 'jsx', jsx: 'jsx', py: 'python', go: 'go', rs: 'rust',
  css: 'css', html: 'markup', xml: 'markup', svg: 'markup', json: 'json', yaml: 'yaml',
  yml: 'yaml', sh: 'bash', sql: 'sql',
} as Record<string, string>)[path.split('.').pop()?.toLowerCase() ?? '']

export function FileDiff({ file, candidateId, comments, viewType, openAll, query, hoveredWord, selectedText, onHoverWord }: Props) {
  const addComment = useStore((s) => s.addComment)
  const [open, setOpen] = useState(false)
  useEffect(() => setOpen(openAll.open), [openAll.open, openAll.version])
  const matchCount = countFileMatches(file, query)
  const lineChanges = countLineChanges(file.hunks)
  const [compose, setCompose] = useState<{ side: Pos['side']; lineNumber: number; end?: Pos }>()
  const [pending, setPending] = useState<Pos>()
  const [notice, setNotice] = useState('')
  const [fileForm, setFileForm] = useState(false)
  const [copyStatus, setCopyStatus] = useState('')

  useEffect(() => {
    if (!pending) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (setPending(undefined), setNotice(''))
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pending])

  const onGutterClick = (p: Pos) => {
    setNotice('')
    const r = resolveClick(file.hunks, pending, p)
    if (r.kind === 'cross') {
      setPending(undefined)
      setNotice('A range must stay within one hunk. Selection cleared.')
    } else if (r.kind === 'start') {
      setCompose(undefined)
      setPending(r.start)
    } else {
      setPending(undefined)
      setCompose({ ...r.start, ...(r.kind === 'range' && { end: r.end }) })
    }
  }

  const copyPath = async () => {
    setCopyStatus(await copyTextToClipboard(file.path) ? 'Copied' : 'Copy failed')
  }

  const diffType = file.isNew ? 'add' : file.isDeleted ? 'delete' : file.isRenamed ? 'rename' : 'modify'
  const mine = useMemo(() => comments.filter((c) => c.file === file.path), [comments, file.path])
  const wholeFile = mine.filter((c) => c.lineNumber === undefined)

  const widgets = useMemo(() => {
    const byKey = new Map<string, { comments: Comment[]; compose: boolean }>()
    const slot = (c: ChangeData) => {
      const k = getChangeKey(c)
      if (!byKey.has(k)) byKey.set(k, { comments: [], compose: false })
      return byKey.get(k)!
    }
    for (const c of mine) {
      if (c.side === undefined || c.lineNumber === undefined) continue
      const ch = changeAt(file.hunks, c.end?.side ?? c.side, c.end?.lineNumber ?? c.lineNumber)
      if (ch) slot(ch as ChangeData).comments.push(c)
    }
    if (compose) {
      const ch = changeAt(file.hunks, compose.end?.side ?? compose.side, compose.end?.lineNumber ?? compose.lineNumber)
      if (ch) slot(ch as ChangeData).compose = true
    }
    return Object.fromEntries(
      [...byKey].map(([k, v]) => [
        k,
        <div className="widget" key={k}>
          {v.comments.map((c) => (
            <CommentView key={c.id} comment={c} hunks={file.hunks} />
          ))}
          {v.compose && compose && (
            <CommentForm
              submitLabel="Add comment"
              onCancel={() => setCompose(undefined)}
              onSubmit={(tags, body) => {
                const snippet = compose.end
                  ? makeRangeSnippet(file.hunks, compose, compose.end)
                  : makeSnippet(file.hunks, compose.side, compose.lineNumber)
                if (!snippet) throw new Error('Those lines are no longer in this diff.')
                addComment({
                  candidateId,
                  file: file.path,
                  ...compose,
                  snippet,
                  tags,
                  body,
                })
                setCompose(undefined)
              }}
            />
          )}
        </div>,
      ]),
    )
  }, [mine, compose, file, candidateId, addComment])

  const tokens = useMemo(() => {
    const ranges = getSearchRanges(file.hunks, query)
    const enhancers = []
    if (query.trim()) enhancers.push(pickRanges(ranges.oldRanges.map((r) => ({ ...r, type: 'search-result' })), ranges.newRanges.map((r) => ({ ...r, type: 'search-result' }))))
    if (selectedText) {
      const selectionRanges = getSearchRanges(file.hunks, selectedText)
      enhancers.push(pickRanges(selectionRanges.oldRanges.map((r) => ({ ...r, type: 'selected-text' })), selectionRanges.newRanges.map((r) => ({ ...r, type: 'selected-text' }))))
    }
    if (hoveredWord) {
      const wordRanges = getTokenRanges(file.hunks, hoveredWord)
      enhancers.push(pickRanges(wordRanges.oldRanges.map((r) => ({ ...r, type: 'hover-word' })), wordRanges.newRanges.map((r) => ({ ...r, type: 'hover-word' }))))
    }
    const language = languageFor(file.path)
    // SAFETY: parser hunks share the line/change shape consumed by react-diff-view's tokenizer.
    return tokenize(file.raw.hunks as unknown as HunkData[], language ? { highlight: true, refractor, language, enhancers } : { enhancers })
  }, [file, query, hoveredWord, selectedText])

  const selected = useMemo(() => {
    const keys = new Set<string>()
    const add = (start: Pos, end?: Pos) => {
      const ch = end ? rangeChanges(file.hunks, start, end) : [changeAt(file.hunks, start.side, start.lineNumber)]
      ch?.forEach((c) => c && keys.add(getChangeKey(c as ChangeData)))
    }
    mine.forEach((c) => c.end && c.side && c.lineNumber !== undefined && add({ side: c.side, lineNumber: c.lineNumber }, c.end))
    if (compose) add(compose, compose.end)
    if (pending) add(pending)
    return [...keys]
  }, [mine, compose, pending, file.hunks])

  return (
    <section className="file">
      <div className="file-bar">
        <div className="file-path-controls">
          <button type="button" className="file-head" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
            <span className={matchCount > 0 ? 'path file-match' : 'path'}>{file.path}</span>
          </button>
          <button type="button" className="icon-button" aria-label="Copy file path" title="Copy file path" onClick={() => void copyPath()}>
            <Copy size={16} aria-hidden="true" />
          </button>
          {copyStatus && <span className="copy-status muted" role="status">{copyStatus}</span>}
        </div>
        <span className="diff-stats" aria-label={`${lineChanges.additions} lines added, ${lineChanges.deletions} lines removed`}>
          <span className="diff-insertions">+{lineChanges.additions}</span>
          <span className="diff-deletions">−{lineChanges.deletions}</span>
        </span>
        {matchCount > 0 && <span className="badge search-count">{matchCount} match{matchCount === 1 ? '' : 'es'}</span>}
        {badge(file) && <span className="badge">{badge(file)}</span>}
        {mine.length > 0 && <span className="badge">{mine.length} comment{mine.length > 1 ? 's' : ''}</span>}
        <button type="button" className="secondary" onClick={() => setFileForm(true)}>
          Comment on file
        </button>
      </div>
      {(wholeFile.length > 0 || fileForm) && (
        <div className="widget">
          {wholeFile.map((c) => (
            <CommentView key={c.id} comment={c} hunks={file.hunks} />
          ))}
          {fileForm && (
            <CommentForm
              submitLabel="Add file comment"
              onCancel={() => setFileForm(false)}
              onSubmit={(tags, body) => {
                addComment({ candidateId, file: file.path, tags, body })
                setFileForm(false)
              }}
            />
          )}
        </div>
      )}
      {open &&
        (file.isBinary ? (
          <p className="muted pad">binary file not shown</p>
        ) : file.hunks.length === 0 ? (
          <p className="muted pad">No content changes.</p>
        ) : (
          <div className="diff-scroll" onMouseMove={(event) => {
            const position = event.currentTarget.ownerDocument.caretPositionFromPoint(event.clientX, event.clientY)
            const node = position?.offsetNode
            onHoverWord(node?.nodeType === Node.TEXT_NODE ? tokenAt(node.textContent ?? '', position?.offset ?? -1) : undefined)
          }} onMouseLeave={() => onHoverWord(undefined)}>
            {pending && <p className="muted pad">Range start set. Click another line in the same hunk to finish, the same line for a single-line comment, Esc to cancel.</p>}
            {notice && <p className="error pad" role="alert">{notice}</p>}
            <Diff
              viewType={viewType}
              diffType={diffType}
              hunks={toDiffHunks(file.raw.hunks)}
              widgets={widgets}
              selectedChanges={selected}
              tokens={tokens}
              renderToken={(token: TokenNode, renderDefault, index) => token.type === 'search-result' ? <mark key={index} className="diff-search-match">{token.children?.map((child, i) => renderDefault(child, i)) ?? token.value}</mark> : token.type === 'selected-text' ? <mark key={index} className="diff-selection-match">{token.children?.map((child, i) => renderDefault(child, i)) ?? token.value}</mark> : token.type === 'hover-word' ? <span key={index} className="diff-code-hover-word">{token.children?.map((child, i) => renderDefault(child, i)) ?? token.value}</span> : renderDefault(token, index)}
              gutterEvents={{
                onClick: ({ change, side }) => change && onGutterClick(lineOf(change, side)),
              }}
            >
              {(hunks) => hunks.map((h) => <Hunk key={h.content} hunk={h} />)}
            </Diff>
          </div>
        ))}
    </section>
  )
}
