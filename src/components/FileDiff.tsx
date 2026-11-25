import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ChevronDown, ChevronRight, Copy, Plus } from 'lucide-react'
import { Diff, Hunk, getChangeKey, markEdits, pickRanges, tokenize, type ChangeData, type HunkData, type TokenNode } from 'react-diff-view'
import refractor from 'refractor/core'
import c from 'refractor/lang/c.js'
import cpp from 'refractor/lang/cpp.js'
import java from 'refractor/lang/java.js'
import swift from 'refractor/lang/swift.js'
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
import { changeAt, lineOf, selectCommentLines, type CommentLineSelection } from './util'
import { countFileMatches, getSearchRanges, tokenAt } from '../lib/diffSearch'
import { countLineChanges } from '../lib/diffStats'
import { codePointAt } from '../lib/codeSelection'
import { copyTextToClipboard } from '../lib/clipboard'
import { locationLabel } from '../lib/location'

for (const grammar of [bash, c, cpp, css, go, java, json, jsx, markup, python, rust, sql, swift, tsx, yaml]) refractor.register(grammar)

interface Props {
  file: DiffFile
  candidateId: string
  comments: Comment[]
  viewType: 'split' | 'unified'
  openAll: { open: boolean; version: number }
  query: string
  focus?: { file: string; side: 'old' | 'new'; lineNumber: number; requestId: number }
  onHoverWord(word?: string): void
}

const badge = (f: DiffFile) =>
  f.isBinary ? 'binary' : f.isNew ? 'new file' : f.isDeleted ? 'deleted' : f.isRenamed ? `renamed from ${f.oldPath}` : ''

const toDiffHunks = (hunks: DiffFile['raw']['hunks']): HunkData[] => {
  // SAFETY: parser hunks and react-diff-view hunks contain the same diff change records.
  return hunks as unknown as HunkData[]
}

const languageFor = (path: string) => ({
  ts: 'tsx', tsx: 'tsx', js: 'jsx', jsx: 'jsx', mjs: 'jsx', mjx: 'jsx', py: 'python', go: 'go', rs: 'rust',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp', hxx: 'cpp',
  java: 'java', swift: 'swift',
  css: 'css', html: 'markup', xml: 'markup', svg: 'markup', json: 'json', yaml: 'yaml',
  yml: 'yaml', sh: 'bash', sql: 'sql',
} as Record<string, string>)[path.split('.').pop()?.toLowerCase() ?? '']

export function FileDiff({ file, candidateId, comments, viewType, openAll, query, onHoverWord, focus }: Props) {
  const addComment = useStore((s) => s.addComment)
  const [open, setOpen] = useState(openAll.open)
  const [headerPinned, setHeaderPinned] = useState(false)
  const stickyMarkerRef = useRef<HTMLSpanElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const scrollToCollapsedHeader = useRef(false)
  useEffect(() => setOpen(openAll.open), [openAll.open, openAll.version])
  useEffect(() => { if (focus?.file === file.path) setOpen(true) }, [focus?.requestId, focus?.file, file.path])
  useLayoutEffect(() => {
    if (!open || focus?.file !== file.path) return
    const gutter = diffRef.current?.querySelector<HTMLElement>(`[data-comment-side="${focus.side}"][data-comment-line="${focus.lineNumber}"] .line-number`)
    if (!gutter) return
    gutter.scrollIntoView({ block: 'center', inline: 'nearest' })
    gutter.focus({ preventScroll: true })
  }, [open, focus?.requestId, focus?.file, focus?.side, focus?.lineNumber, file.path])
  useLayoutEffect(() => {
    if (open || !scrollToCollapsedHeader.current) return
    scrollToCollapsedHeader.current = false
    const marker = stickyMarkerRef.current
    if (marker) window.scrollTo({ top: window.scrollY + marker.getBoundingClientRect().top, behavior: 'instant' })
  }, [open])
  useEffect(() => {
    const marker = stickyMarkerRef.current
    if (!marker || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => {
      setHeaderPinned(!entry.isIntersecting && entry.boundingClientRect.top < 0)
    }, { rootMargin: '-1px 0px 0px 0px' })
    observer.observe(marker)
    return () => observer.disconnect()
  }, [])
  const matchCount = countFileMatches(file, query)
  const lineChanges = countLineChanges(file.hunks)
  const gutterWidths = useMemo(() => {
    let oldDigits = 0
    let newDigits = 0
    for (const hunk of file.hunks) for (const change of hunk.changes) {
      if (change.type !== 'insert') oldDigits = Math.max(oldDigits, String(change.type === 'normal' ? change.oldLineNumber : change.lineNumber).length)
      if (change.type !== 'delete') newDigits = Math.max(newDigits, String(change.type === 'normal' ? change.newLineNumber : change.lineNumber).length)
    }
    return { '--old-line-width': `${oldDigits}ch`, '--new-line-width': `${newDigits}ch`, '--single-line-width': `${file.isDeleted ? oldDigits : newDigits}ch` } as CSSProperties
  }, [file.hunks, file.isDeleted])
  const [compose, setCompose] = useState<{ side: Pos['side']; lineNumber: number; end?: Pos; lines?: Pos[] }>()
  const [selection, setSelection] = useState<CommentLineSelection>()
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ start: Pos; pointerId: number; fromPlus: boolean; moved: boolean; existing?: CommentLineSelection } | undefined>(undefined)
  const diffRef = useRef<HTMLDivElement>(null)
  const suppressClick = useRef(false)
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
    setSelection(undefined)
    dragRef.current = undefined
    setDragging(false)
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
  const selectLinkedLines = () => {
    const values = lineInput.split(',').map((value) => value.trim())
    const positions = values.map((value): Pos => ({ side: value.startsWith('-') || value.startsWith('−') ? 'old' : 'new', lineNumber: Number(value.replace(/^[-−+]/, '')) }))
    if (values.some((value) => !/^[-−+]?[1-9]\d*$/.test(value)) || positions.some((position) => !locate(file.hunks, position.side, position.lineNumber))) {
      setNotice('Enter line numbers present in this diff, such as 1,5,11 or -15,+24.')
      return
    }
    setLinked(linkedPositions(file.hunks, positions))
    setNotice('')
  }
  const commentOnLinkedLines = () => {
    if (!linked.length) return
    setCompose({ ...linked[0], lines: linked })
    cancelLinks()
    setOpen(true)
  }

  useEffect(() => {
    if (!selection && !linking && !dragging) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setSelection(undefined)
      dragRef.current = undefined
      setDragging(false)
      suppressClick.current = true
      cancelLinks()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selection, linking, dragging])

  const selectLine = (p: Pos, extend: boolean) => {
    if (compose) { setNotice('Save or cancel your comment before selecting other lines.'); return }
    setNotice('')
    if (linking) {
      const row = locate(file.hunks, p.side, p.lineNumber)?.change
      setLinked((current) => linkedPositions(file.hunks, current.some((item) => locate(file.hunks, item.side, item.lineNumber)?.change === row)
        ? current.filter((item) => locate(file.hunks, item.side, item.lineNumber)?.change !== row) : [...current, p]))
      return
    }
    const next = selectCommentLines(file.hunks, selection, p, extend)
    if (!next) setNotice('A range must stay within one hunk. Use Link lines for separate hunks.')
    else setSelection(next)
  }

  const selectionAt = (p: Pos): CommentLineSelection => {
    const change = changeAt(file.hunks, p.side, p.lineNumber)
    return selection && (selection.end ? rangeChanges(file.hunks, selection.start, selection.end) : [changeAt(file.hunks, selection.start.side, selection.start.lineNumber)])?.includes(change!)
      ? selection : { start: p }
  }

  const beginDrag = (event: React.PointerEvent, p: Pos, fromPlus: boolean) => {
    if (linking) { suppressClick.current = false; return }
    if (event.button !== 0 || event.isPrimary === false || compose) return
    event.preventDefault()
    event.stopPropagation()
    suppressClick.current = false
    const existing = fromPlus ? selectionAt(p) : selectCommentLines(file.hunks, selection, p, event.shiftKey)
    dragRef.current = { start: p, pointerId: event.pointerId, fromPlus, moved: false, existing }
    setDragging(true)
    setSelection(existing)
    setNotice('')
  }

  useEffect(() => {
    if (!dragging) return
    const positionAt = (event: PointerEvent): Pos | undefined => {
      const element = document.elementFromPoint(event.clientX, event.clientY)
      let target = element?.closest<HTMLElement>('[data-comment-line]')
      const codeCell = element?.closest('td.diff-code:not(.diff-code-omit)')
      if (!target && codeCell) {
        target = codeCell.previousElementSibling?.querySelector<HTMLElement>('[data-comment-line]')
          ?? codeCell.previousElementSibling?.previousElementSibling?.querySelector<HTMLElement>('[data-comment-line]')
      }
      if (!target || !diffRef.current?.contains(target)) return undefined
      return { side: target.dataset.commentSide as Pos['side'], lineNumber: Number(target.dataset.commentLine) }
    }
    const move = (event: PointerEvent) => {
      const drag = dragRef.current
      const p = positionAt(event)
      if (!drag || drag.pointerId !== event.pointerId || !p) return
      if (locate(file.hunks, drag.start.side, drag.start.lineNumber)?.change !== locate(file.hunks, p.side, p.lineNumber)?.change) drag.moved = true
      const next = selectCommentLines(file.hunks, { start: drag.start }, p, true)
      if (next) setSelection(next)
    }
    const finish = (event: PointerEvent) => {
      const drag = dragRef.current
      if (drag?.pointerId !== event.pointerId) return
      dragRef.current = undefined
      setDragging(false)
      suppressClick.current = true
      window.setTimeout(() => { suppressClick.current = false }, 0)
      if (!drag) return
      const p = positionAt(event)
      if (!p) { setSelection(undefined); return }
      const changedRow = locate(file.hunks, drag.start.side, drag.start.lineNumber)?.change !== locate(file.hunks, p.side, p.lineNumber)?.change
      const next = drag.moved || changedRow ? selectCommentLines(file.hunks, { start: drag.start }, p, true) : drag.existing
      if (!next) { setSelection(undefined); setNotice('A range must stay within one hunk. Use Link lines for separate hunks.'); return }
      if (drag.fromPlus) { setCompose({ ...next.start, end: next.end }); setSelection(undefined) }
      else setSelection(next)
    }
    const cancel = () => { dragRef.current = undefined; suppressClick.current = true; setDragging(false); setSelection(undefined) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('blur', cancel)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('blur', cancel)
    }
  }, [dragging, file.hunks])

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
    if (selection) add(selection.start, selection.end)
    return [...keys]
  }, [mine, compose, selection, linked, file.hunks])

  return (
    <section className="file">
      <span ref={stickyMarkerRef} className="file-sticky-marker" aria-hidden="true" />
      <div ref={headerRef} className={headerPinned ? 'file-bar is-pinned' : 'file-bar'}>
        <div className="file-path-controls">
          <button type="button" className="file-head" aria-expanded={open} onClick={() => {
            scrollToCollapsedHeader.current = open && Math.abs(headerRef.current?.getBoundingClientRect().top ?? Infinity) <= 1
            setOpen(!open)
          }}>
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
            if (compose) { setNotice('Save or cancel your comment before linking lines.'); return }
            setSelection(undefined)
            setLinking(true)
            setOpen(true)
          }
        }}>Link lines</button>}
        <button type="button" className="secondary" onClick={() => setFileForm(true)}>
          Comment on file
        </button>
        {linking && headerPinned && <div className="linked-selection-header">
          <form className="row" onSubmit={(event) => { event.preventDefault(); selectLinkedLines() }}>
            <label>Lines <input aria-label={`Lines to link in ${file.path} header`} value={lineInput} placeholder="1,5,11 or -15,+24" onChange={(event) => setLineInput(event.target.value)} /></label>
            <button type="submit" className="secondary">Select lines</button>
          </form>
          <span className="muted" role="status">{linked.length ? `Selected: ${locationLabel({ ...linked[0], lines: linked }, file.hunks)}` : 'No lines selected.'}</span>
          <button type="button" disabled={!linked.length} onClick={commentOnLinkedLines}>Comment on selected lines</button>
          <button type="button" className="secondary" onClick={cancelLinks}>Cancel selection</button>
          {notice && <span className="error" role="alert">{notice}</span>}
        </div>}
      </div>
      {linking && <div className="widget linked-selection">
        <p className="help">Click line numbers to select or remove separate lines in this file. Enter numbers such as 1,5,11 or -15,+24: − is the old side, + is the new side. Esc cancels.</p>
        <form className="row" onSubmit={(event) => { event.preventDefault(); selectLinkedLines() }}>
          <label>Lines to link <input aria-label={`Lines to link in ${file.path}`} value={lineInput} placeholder="1,5,11 or -15,+24" onChange={(event) => setLineInput(event.target.value)} /></label>
          <button type="submit" className="secondary">Select lines</button>
        </form>
        <p role="status">{linked.length ? `Selected lines: ${locationLabel({ ...linked[0], lines: linked }, file.hunks)}` : 'No lines selected.'}</p>
        <div className="row">
          <button type="button" disabled={!linked.length} onClick={commentOnLinkedLines}>Comment on selected lines</button>
          <button type="button" className="secondary" onClick={cancelLinks}>Cancel selection</button>
        </div>
      </div>}
      {open && !linking && !file.isBinary && file.hunks.length > 0 && <div className="widget comment-selection" role="region" aria-label="Selected comment lines">
        <span role="status">{selection ? <>Selected lines: <strong className="loc">{locationLabel({ ...selection.start, end: selection.end }, file.hunks)}</strong></> : 'No lines selected.'}</span>
        <button type="button" disabled={!selection} onClick={() => { if (selection) { setCompose({ ...selection.start, end: selection.end }); setSelection(undefined) } }}>Comment on selection</button>
        <button type="button" className="secondary" disabled={!selection} onClick={() => setSelection(undefined)}>Cancel selection</button>
      </div>}
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
          <div ref={diffRef} style={gutterWidths} className={`diff-scroll${dragging ? ' selecting-comment' : ''}${file.isNew || file.isDeleted ? ' single-sided-diff' : ''}`} onMouseMove={(event) => {
            const point = codePointAt(event.currentTarget.ownerDocument, event.clientX, event.clientY)
            onHoverWord(point && event.currentTarget.contains(point.cell) ? tokenAt(point.cell.textContent ?? '', point.offset) : undefined)
          }} onMouseLeave={() => onHoverWord(undefined)}>
            <Diff
              viewType={viewType}
              diffType={diffType}
              hunks={toDiffHunks(file.raw.hunks)}
              widgets={widgets}
              selectedChanges={selected}
              tokens={tokens}
              renderToken={(token: TokenNode, renderDefault, index) => token.type === 'search-result' ? <mark key={index} className="diff-search-match">{token.children?.map((child, i) => renderDefault(child, i)) ?? token.value}</mark> : renderDefault(token, index)}
              renderGutter={({ change, side, renderDefault }) => {
                const number = renderDefault()
                const hasNumber = number !== null && number !== undefined
                const hasAction = viewType === 'unified' ? side === 'new' : hasNumber
                if (!hasNumber && !hasAction) return number
                const p = lineOf(change, side)
                const label = `${p.side} line ${p.lineNumber}`
                return <span className={`comment-gutter${hasAction ? ' has-comment-action' : ''}`} data-comment-line={p.lineNumber} data-comment-side={p.side}>
                  {hasNumber && <button type="button" className="line-number" aria-label={`${linking ? 'Toggle linked' : 'Select'} ${label}`} title={`${label}: ${linking ? 'select or remove this linked line' : 'click to select; Shift-click to extend the range'}`}
                    onPointerDown={(event) => beginDrag(event, p, false)}
                    onClick={(event) => { event.stopPropagation(); if (!suppressClick.current || event.detail === 0) selectLine(p, event.shiftKey) }}>{number}</button>}
                  {hasAction && !linking && <button type="button" className="line-comment-add" aria-label={`Add comment on ${label}`} title={`Comment on ${label}; drag to comment on multiple lines`} disabled={!!compose}
                    onPointerDown={(event) => beginDrag(event, p, true)}
                    onClick={(event) => {
                      event.stopPropagation()
                      if ((suppressClick.current && event.detail !== 0) || compose) return
                      const next = selectionAt(p)
                      setCompose({ ...next.start, end: next.end })
                      setSelection(undefined)
                    }}><Plus size={14} aria-hidden="true" /></button>}
                </span>
              }}
            >
              {(hunks) => hunks.map((h) => <Hunk key={h.content} hunk={h} />)}
            </Diff>
          </div>
        ))}
      {notice && !headerPinned && <p className="error pad" role="alert">{notice}</p>}
    </section>
  )
}
