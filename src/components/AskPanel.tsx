import { useEffect, useRef, useState } from 'react'
import { PanelLeftClose, PanelLeftOpen, Pencil, X } from 'lucide-react'
import Markdown from 'react-markdown'
import { useStore, type Problem } from '../store'

export function AskPanel({ problem }: { problem: Problem }) {
  const editProblem = useStore((s) => s.editProblem)
  const [open, setOpen] = useState(true)
  const [draft, setDraft] = useState<string>()
  const [renderMarkdown, setRenderMarkdown] = useState(true)
  const [previewOpen, setPreviewOpen] = useState(false)
  const previewSuppressed = useRef(false)
  const pointerInside = useRef(false)
  const panelRef = useRef<HTMLElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)

  const closePreview = () => {
    previewSuppressed.current = true
    setPreviewOpen(false)
    if (panelRef.current?.querySelector('.ask-preview')?.contains(document.activeElement)) toggleRef.current?.focus()
  }

  useEffect(() => {
    if (!previewOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePreview()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [previewOpen])

  const requestText = problem.askMarkdown.trim()
    ? renderMarkdown ? <div className="markdown ask-markdown"><Markdown>{problem.askMarkdown}</Markdown></div>
      : <div className="ask-plain">{problem.askMarkdown}</div>
    : <p className="muted">Add the original request to keep it beside the diff while you review.</p>
  const markdownOption = <label className="ask-format"><input type="checkbox" checked={renderMarkdown} onChange={(event) => setRenderMarkdown(event.target.checked)} /> Render Markdown</label>

  return (
    <aside ref={panelRef} className={open ? 'ask' : 'ask collapsed'} aria-label="Original ask"
      onMouseEnter={() => {
        pointerInside.current = true
        if (!open && !previewSuppressed.current) setPreviewOpen(true)
      }}
      onMouseLeave={() => {
        pointerInside.current = false
        previewSuppressed.current = false
        if (!panelRef.current?.contains(document.activeElement)) setPreviewOpen(false)
      }}
      onFocus={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          previewSuppressed.current = false
          if (!open) setPreviewOpen(true)
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          previewSuppressed.current = false
          if (!pointerInside.current) setPreviewOpen(false)
        }
      }}>
      <div className="ask-header">
        {open && <div className="ask-heading"><span className="ask-eyebrow">Review brief</span><h2>Original ask</h2></div>}
        {open && draft === undefined && (
          <button className="icon-button" aria-label="Edit original ask" title="Edit original ask" onClick={() => setDraft(problem.askMarkdown)}>
            <Pencil size={16} aria-hidden="true" />
          </button>
        )}
        <button ref={toggleRef} className="icon-button" aria-label={open ? 'Hide original ask' : 'Show original ask'} title={open ? 'Hide original ask' : 'Show original ask'} aria-expanded={open} aria-haspopup={!open ? 'dialog' : undefined} aria-controls={!open && previewOpen ? `ask-preview-${problem.id}` : undefined} onClick={() => { setOpen(!open); setPreviewOpen(false) }}>
          {open ? <PanelLeftClose size={18} aria-hidden="true" /> : <PanelLeftOpen size={18} aria-hidden="true" />}
        </button>
        {!open && <span className="ask-restore-label">Original ask</span>}
      </div>
      {open && (
        <div className="ask-content">
          <p className="ask-review-title">{problem.title}</p>
          {markdownOption}
          {draft === undefined ? (
            <>
              {requestText}
              {!problem.askMarkdown.trim() && <button className="secondary" onClick={() => setDraft('')}>Add original ask</button>}
            </>
          ) : (
            <>
              <label className="ask-editor-label" htmlFor={`ask-${problem.id}`}>Edit original ask</label>
              <p className="help">Markdown supported. Save to update the review brief.</p>
              <textarea id={`ask-${problem.id}`} aria-label="Ask markdown" rows={14} value={draft} onChange={(e) => setDraft(e.target.value)} />
              <div className="row">
                <button
                  onClick={() => {
                    editProblem(problem.id, { askMarkdown: draft })
                    setDraft(undefined)
                  }}
                >
                  Save ask
                </button>
                <button className="secondary" onClick={() => setDraft(undefined)}>Cancel</button>
              </div>
            </>
          )}
        </div>
      )}
      {!open && previewOpen && (
        <div className="ask-preview" role="dialog" aria-label="Original ask preview" id={`ask-preview-${problem.id}`}>
          <div className="ask-header">
            <div className="ask-heading"><span className="ask-eyebrow">Review brief</span><h2>Original ask</h2></div>
            <button type="button" className="icon-button" aria-label="Close original ask preview" onClick={closePreview}><X size={18} aria-hidden="true" /></button>
          </div>
          <div className="ask-content">
            <p className="ask-review-title">{problem.title}</p>
            {markdownOption}
            {requestText}
          </div>
        </div>
      )}
    </aside>
  )
}
