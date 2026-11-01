import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Copy } from 'lucide-react'
import { Diff, Hunk, getChangeKey, markEdits, pickRanges, tokenize, type ChangeData, type HunkData, type TokenNode } from 'react-diff-view'
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
import { linkedPositions, locate, makeLinkedSnippet, makeRangeSnippet, makeSnippet, rangeChanges, type Pos } from '../lib/snippet'
import { useStore, type Comment } from '../store'
import { CommentForm } from './CommentForm'
import { CommentView } from './CommentView'
import { changeAt, lineOf, resolveClick } from './util'
import { countFileMatches, getSearchRanges, tokenAt } from '../lib/diffSearch'
import { countLineChanges } from '../lib/diffStats'
import { codePointAt } from '../lib/codeSelection'
import { copyTextToClipboard } from '../lib/clipboard'
import { locationLabel } from '../lib/location'

for (const grammar of [bash, css, go, json, jsx, markup, python, rust, sql, tsx, yaml]) refractor.register(grammar)

interface Props {
  file: DiffFile
  candidateId: string
  comments: Comment[]
  viewType: 'split' | 'unified'
  openAll: { open: boolean; version: number }
  query: string
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

export function FileDiff({ file, candidateId, comments, viewType, openAll, query, onHoverWord }: Props) {
  const addComment = useStore((s) => s.addComment)
  const [open, setOpen] = useState(false)
  useEffect(() => setOpen(openAll.open), [openAll.open, openAll.version])
  const matchCount = countFileMatches(file, query)
  const lineChanges = countLineChanges(file.hunks)
  const [compose, setCompose] = useState<{ side: Pos['side']; lineNumber: number; end?: Pos; lines?: Pos[] }>()
  const [pending, setPending] = useState<Pos>()
  const [linking, setLinking] = useState(false)
  const [linked, setLinked] = useState<Pos[]>([])
  const [lineInput, setLineInput] = useState('')
  const [notice, setNotice] = useState('')
  const [fileForm, setFileForm] = useState(false)
  const [copyStatus, setCopyStatus] = useState('')
  const composerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!compose) return
    composerRef.current?.scrollIntoView({ block: 'nearest' })
    composerRef.current?.querySelector('input')?.focus({ preventScroll: true })
  }, [compose])

  useEffect(() => {
    setPending(undefined)
    setCompose(undefined)
    setLinked([])
    setLinking(false)
    setLineInput('')
    setNotice('')
  }, [file.hunks])

  const cancelLinks = () => {
    setLinked([])
    setLinking(false)
    setLineInput('')
    setNotice('')
  }

  useEffect(() => {
    if (!pending && !linking) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setPending(undefined)
      cancelLinks()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pending, linking])

  const onGutterClick = (p: Pos) => {
    setNotice('')
    if (linking) {
      const row = locate(file.hunks, p.side, p.lineNumber)?.change
      setLinked((current) => linkedPositions(file.hunks, current.some((item) => locate(file.hunks, item.side, item.lineNumber)?.change === row)
        ? current.filter((item) => locate(file.hunks, item.side, item.lineNumber)?.change !== row) : [...current, p]))
      return
    }
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
      const anchor = c.lines?.at(-1) ?? c.end ?? c
      const ch = changeAt(file.hunks, anchor.side!, anchor.lineNumber!)
      if (ch) slot(ch as ChangeData).comments.push(c)
    }
    if (compose) {
      const anchor = compose.lines?.at(-1) ?? compose.end ?? compose
      const ch = changeAt(file.hunks, anchor.side, anchor.lineNumber)
      if (ch) slot(ch as ChangeData).compose = true
    }
    return Object.fromEntries(
      [...byKey].map(([k, v]) => [
        k,
        <div className="widget" key={k} ref={v.compose ? composerRef : undefined}>
          {v.comments.map((c) => (
            <CommentView key={c.id} comment={c} hunks={file.hunks} />
          ))}
          {v.compose && compose && (
            <>
            <p className="loc">Comment on {locationLabel(compose, file.hunks)}</p>
            <CommentForm
              submitLabel="Add comment"
              onCancel={() => setCompose(undefined)}
              onSubmit={(tags, body) => {
                const snippet = compose.lines ? makeLinkedSnippet(file.hunks, compose.lines) : compose.end
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
            </>
          )}
        </div>,
      ]),
    )
  }, [mine, compose, file, candidateId, addComment])

  const tokens = useMemo(() => {
    const hunks = toDiffHunks(file.raw.hunks)
    const ranges = getSearchRanges(file.hunks, query)
    const enhancers = [markEdits(hunks, { type: 'block' })]
    if (query.trim()) enhancers.push(pickRanges(ranges.oldRanges.map((r) => ({ ...r, type: 'search-result' })), ranges.newRanges.map((r) => ({ ...r, type: 'search-result' }))))
    const language = languageFor(file.path)
    return tokenize(hunks, language ? { highlight: true, refractor, language, enhancers } : { enhancers })
  }, [file, query])

  const selected = useMemo(() => {
    const keys = new Set<string>()
    const add = (start: Pos, end?: Pos) => {
      const ch = end ? rangeChanges(file.hunks, start, end) : [changeAt(file.hunks, start.side, start.lineNumber)]
      ch?.forEach((c) => c && keys.add(getChangeKey(c as ChangeData)))
    }
    mine.forEach((c) => c.lines ? c.lines.forEach((p) => add(p)) : c.end && c.side && c.lineNumber !== undefined && add({ side: c.side, lineNumber: c.lineNumber }, c.end))
    if (compose?.lines) compose.lines.forEach((p) => add(p))
    else if (compose) add(compose, compose.end)
    linked.forEach((p) => add(p))
    if (pending) add(pending)
    return [...keys]
  }, [mine, compose, pending, linked, file.hunks])

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
        {!file.isBinary && file.hunks.length > 0 && <button type="button" className="secondary" aria-pressed={linking} onClick={() => {
          if (linking) cancelLinks()
          else {
            setPending(undefined)
            setCompose(undefined)
            setLinking(true)
            setOpen(true)
          }
        }}>Link lines</button>}
        <button type="button" className="secondary" onClick={() => setFileForm(true)}>
          Comment on file
        </button>
      </div>
      {linking && <div className="widget linked-selection">
        <p className="help">Click line numbers to select or remove separate lines in this file. Or enter comma-separated line numbers below; prefix removed lines with −. Esc cancels.</p>
        <form className="row" onSubmit={(event) => {
          event.preventDefault()
          const values = lineInput.split(',').map((value) => value.trim())
          const positions = values.map((value): Pos => ({ side: value.startsWith('-') || value.startsWith('−') ? 'old' : 'new', lineNumber: Number(value.replace(/^[-−]/, '')) }))
          if (values.some((value) => !/^[-−]?[1-9]\d*$/.test(value)) || positions.some((p) => !locate(file.hunks, p.side, p.lineNumber))) {
            setNotice('Enter line numbers present in this diff, such as 1,5,11 or -3,5.')
            return
          }
          setLinked(linkedPositions(file.hunks, positions))
          setNotice('')
        }}>
          <label>Lines to link <input aria-label={`Lines to link in ${file.path}`} value={lineInput} placeholder="1,5,11" onChange={(event) => setLineInput(event.target.value)} /></label>
          <button type="submit" className="secondary">Select lines</button>
        </form>
        <p role="status">{linked.length ? `Selected lines: ${locationLabel({ ...linked[0], lines: linked }, file.hunks)}` : 'No lines selected.'}</p>
        <div className="row">
          <button type="button" disabled={!linked.length} onClick={() => {
            setCompose({ ...linked[0], lines: linked })
            cancelLinks()
            setOpen(true)
          }}>Comment on selected lines</button>
          <button type="button" className="secondary" onClick={cancelLinks}>Cancel selection</button>
        </div>
      </div>}
      {notice && <p className="error pad" role="alert">{notice}</p>}
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
            const point = codePointAt(event.currentTarget.ownerDocument, event.clientX, event.clientY)
            onHoverWord(point && event.currentTarget.contains(point.cell) ? tokenAt(point.cell.textContent ?? '', point.offset) : undefined)
          }} onMouseLeave={() => onHoverWord(undefined)}>
            {pending && <p className="muted pad">Range start set. Click another line in the same hunk to finish, the same line for a single-line comment, Esc to cancel.</p>}
            <Diff
              viewType={viewType}
              diffType={diffType}
              hunks={toDiffHunks(file.raw.hunks)}
              widgets={widgets}
              selectedChanges={selected}
              tokens={tokens}
              renderToken={(token: TokenNode, renderDefault, index) => token.type === 'search-result' ? <mark key={index} className="diff-search-match">{token.children?.map((child, i) => renderDefault(child, i)) ?? token.value}</mark> : renderDefault(token, index)}
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
