import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { createHoverWordDelay } from '../lib/hoverWordDelay'
import { useStore } from '../store'
import { AskPanel } from './AskPanel'
import { CandidateTabs } from './CandidateTabs'
import { DiffView } from './DiffView'
import { NotesModal } from './NotesModal'
import { exportProblem } from './util'
import { clearCodeHighlights, paintCodeHighlights, readCodeSelection, selectCodeIdentifier } from '../lib/codeSelection'
import { categories, tagLabel } from '../lib/categories'

import { FindingsPanel } from './FindingsPanel'
export function Workspace({ id }: { id: string }) {
  const problem = useStore((s) => s.problems.find((p) => p.id === id))
  const [selected, setSelected] = useState<string>()
  const [secondId, setSecondId] = useState<string>()
  const [compare, setCompare] = useState(false)
  const [citationFocus, setCitationFocus] = useState<{ file: string; side: 'old' | 'new'; lineNumber: number; requestId: number }>()
  const focusCitation = (target: { file: string; side: 'old' | 'new'; lineNumber: number }) => {
    setCitationFocus((current) => ({ ...target, requestId: (current?.requestId ?? 0) + 1 }))
    if (target.side === 'old') setViewType('split')
  }
  const [notesOpen, setNotesOpen] = useState(false)
  const editCandidate = useStore((s) => s.editCandidate)
  const [viewType, setViewType] = useState<'split' | 'unified'>('unified')
  const [openAll, setOpenAll] = useState({ open: false, version: 0 })
  const [query, setQuery] = useState('')
  const [hoveredWord, setHoveredWord] = useState<string>()
  const [selectedText, setSelectedText] = useState<string>()
  const workspaceRef = useRef<HTMLDivElement>(null)
  const hoverWordDelay = useMemo(() => createHoverWordDelay(setHoveredWord), [])
  useEffect(() => () => hoverWordDelay.dispose(), [hoverWordDelay])
  useEffect(() => {
    const root = workspaceRef.current
    if (!root) return
    let frame = 0
    const repaint = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => paintCodeHighlights(root, selectedText, hoveredWord))
    }
    const updateSelection = () => setSelectedText(readCodeSelection(root.ownerDocument.getSelection(), root))
    const doubleClick = (event: MouseEvent) => {
      selectCodeIdentifier(event, root)
      updateSelection()
    }
    const observer = new MutationObserver(repaint)
    observer.observe(root, { childList: true, subtree: true })
    root.ownerDocument.addEventListener('selectionchange', updateSelection)
    root.addEventListener('dblclick', doubleClick)
    repaint()
    return () => {
      observer.disconnect()
      root.ownerDocument.removeEventListener('selectionchange', updateSelection)
      root.removeEventListener('dblclick', doubleClick)
      cancelAnimationFrame(frame)
      clearCodeHighlights()
    }
  }, [selectedText, hoveredWord])
  const customTags = useStore((s) => s.customTags)

  if (!problem) {
    return (
      <main>
        <p>Review not found.</p>
        <a href="#/">Back to reviews</a>
      </main>
    )
  }
  const cands = problem.candidates
  const first = cands.find((c) => c.id === selected) ?? cands[0]
  const second = cands.find((c) => c.id === secondId) ?? cands.find((c) => c.id !== first?.id)

  const picker = (value: string | undefined, set: (v: string) => void, label: string) => (
    <select aria-label={label} value={value} onChange={(e) => set(e.target.value)}>
      {cands.map((c) => (
        <option key={c.id} value={c.id}>{c.label}</option>
      ))}
    </select>
  )

  return (
    <div className="workspace" ref={workspaceRef}>
      <AskPanel problem={problem} />
      <main>
        <header className="bar">
          <a className="back-link" href="#/"><ArrowLeft size={16} aria-hidden="true" />Reviews</a>
          <h1>{problem.title}</h1>
          <a href={`#/p/${id}/digest`}>Digest</a>
          <a href={`#/p/${id}/review`}>Review</a>
        </header>
        <CandidateTabs problem={problem} selectedId={first?.id} onSelect={(candidateId) => { setCitationFocus(undefined); setSelected(candidateId) }} />
        {first && (
          <textarea
            className="candidate-note"
            aria-label={`Overall note for ${first.label}`}
            placeholder={`Overall note for ${first.label}`}
            rows={2}
            value={first.note ?? ''}
            onChange={(e) => editCandidate(problem.id, first.id, { note: e.target.value })}
          />
        )}
        {first && (
          <div className="row toolbar">
            <label>
              <input type="checkbox" checked={viewType === 'split'} onChange={(e) => setViewType(e.target.checked ? 'split' : 'unified')} /> Split view
            </label>
            {cands.length > 1 && (
              <label>
                <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} /> Compare two
              </label>
            )}
            <button type="button" className="secondary" onClick={() => setOpenAll((state) => ({ open: true, version: state.version + 1 }))}>Expand all</button>
            <button type="button" className="secondary" onClick={() => setOpenAll((state) => ({ open: false, version: state.version + 1 }))}>Collapse all</button>
            <label className="diff-search">Search diff <input type="search" aria-label="Search diff" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
            <button type="button" onClick={() => setNotesOpen(true)}>Output notes</button>
            <button type="button" className="secondary" onClick={() => exportProblem(problem)}>Export</button>
          </div>
        )}
        {notesOpen && <NotesModal problem={problem} onClose={() => setNotesOpen(false)} />}
        {first && <p className="muted hint">Hover a line and click + to comment. Drag + across lines, or click a line number then Shift-click another to select a range. Use “Link lines” for separate lines such as 1,5,11. Esc cancels selection.</p>}
        {first && compare && second ? (
          <div className="compare">
            <div>
              {picker(first.id, setSelected, 'Left candidate')}
              <DiffView key={first.id} candidate={first} viewType={viewType} openAll={openAll} query={query} onHoverWord={hoverWordDelay.setHoveredWord} />
            </div>
            <div>
              {picker(second.id, setSecondId, 'Right candidate')}
              <DiffView key={second.id} candidate={second} viewType={viewType} openAll={openAll} query={query} onHoverWord={hoverWordDelay.setHoveredWord} />
            </div>
          </div>
        ) : (
          first && <div className="research-layout"><FindingsPanel key={first.id} problemId={problem.id} candidate={first} onFocus={focusCitation} /><DiffView key={first.id} candidate={first} viewType={viewType} openAll={openAll} query={query} focus={citationFocus} onHoverWord={hoverWordDelay.setHoveredWord} /></div>
        )}
        {first && compare && second && <p className="muted">Leave comparison mode to research findings for one patch at a time.</p>}
        <section className="tag-guide" aria-labelledby="tag-guide-title">
          <h2 id="tag-guide-title">Available tags</h2>
          <ul>{categories.map((category) => <li key={category.slug}><strong>{category.label}</strong> — {category.description}</li>)}</ul>
          <h3>User-defined tags</h3>
          {customTags.length ? <ul>{customTags.map((tag) => <li key={tag}>{tagLabel(tag)}</li>)}</ul> : <p className="muted">No user-defined tags yet.</p>}
        </section>
      </main>
    </div>
  )
}
