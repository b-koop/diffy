import { useEffect, useMemo, useState } from 'react'
import { createHoverWordDelay } from '../lib/hoverWordDelay'
import { useStore } from '../store'
import { AskPanel } from './AskPanel'
import { CandidateTabs } from './CandidateTabs'
import { DiffView } from './DiffView'
import { NotesModal } from './NotesModal'
import { exportProblem } from './util'
import { categories, tagLabel } from '../lib/categories'

export function Workspace({ id }: { id: string }) {
  const problem = useStore((s) => s.problems.find((p) => p.id === id))
  const [selected, setSelected] = useState<string>()
  const [secondId, setSecondId] = useState<string>()
  const [compare, setCompare] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const editCandidate = useStore((s) => s.editCandidate)
  const [viewType, setViewType] = useState<'split' | 'unified'>('unified')
  const [openAll, setOpenAll] = useState({ open: false, version: 0 })
  const [query, setQuery] = useState('')
  const [hoveredWord, setHoveredWord] = useState<string>()
  const [selectedText, setSelectedText] = useState<string>()
  const hoverWordDelay = useMemo(() => createHoverWordDelay(setHoveredWord), [])
  useEffect(() => () => hoverWordDelay.dispose(), [hoverWordDelay])
  useEffect(() => {
    const updateSelection = () => {
      const selection = document.getSelection()
      const range = selection?.rangeCount ? selection.getRangeAt(0) : undefined
      const container = range?.commonAncestorContainer
      const selectionRoot = container instanceof Element ? container : container?.parentElement
      setSelectedText(selectionRoot?.closest('.diff-scroll') ? selection?.toString().trim() || undefined : undefined)
    }
    document.addEventListener('selectionchange', updateSelection)
    return () => document.removeEventListener('selectionchange', updateSelection)
  }, [])
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
    <div className="workspace">
      <AskPanel problem={problem} />
      <main>
        <header className="bar">
          <a href="#/">‹ Reviews</a>
          <h1>{problem.title}</h1>
          <a href={`#/p/${id}/digest`}>Digest</a>
          <a href={`#/p/${id}/review`}>Review</a>
        </header>
        <CandidateTabs problem={problem} selectedId={first?.id} onSelect={setSelected} />
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
        {first && <p className="muted hint">Click a line number to start a comment range, then click another line in the same hunk to end it. Click the start line again for a single-line comment; Esc cancels.</p>}
        {first && compare && second ? (
          <div className="compare">
            <div>
              {picker(first.id, setSelected, 'Left candidate')}
              <DiffView key={first.id} candidate={first} viewType={viewType} openAll={openAll} query={query} hoveredWord={hoveredWord} selectedText={selectedText} onHoverWord={hoverWordDelay.setHoveredWord} />
            </div>
            <div>
              {picker(second.id, setSecondId, 'Right candidate')}
              <DiffView key={second.id} candidate={second} viewType={viewType} openAll={openAll} query={query} hoveredWord={hoveredWord} selectedText={selectedText} onHoverWord={hoverWordDelay.setHoveredWord} />
            </div>
          </div>
        ) : (
          first && <DiffView key={first.id} candidate={first} viewType={viewType} openAll={openAll} query={query} hoveredWord={hoveredWord} selectedText={selectedText} onHoverWord={hoverWordDelay.setHoveredWord} />
        )}
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
