import { useState } from 'react'
import Markdown from 'react-markdown'
import { useStore, type Problem } from '../store'

export function AskPanel({ problem }: { problem: Problem }) {
  const editProblem = useStore((s) => s.editProblem)
  const [open, setOpen] = useState(true)
  const [draft, setDraft] = useState<string>()

  return (
    <aside className={open ? 'ask' : 'ask collapsed'}>
      <button className="secondary" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? '« Hide ask' : '»'}
      </button>
      {open && (
        <>
          <h2>Original ask</h2>
          {draft === undefined ? (
            <>
              <div className="markdown">
                {problem.askMarkdown.trim() ? <Markdown>{problem.askMarkdown}</Markdown> : <p className="muted">No ask yet.</p>}
              </div>
              <button className="link" onClick={() => setDraft(problem.askMarkdown)}>Edit</button>
            </>
          ) : (
            <>
              <textarea aria-label="Ask markdown" rows={12} value={draft} onChange={(e) => setDraft(e.target.value)} />
              <div className="row">
                <button
                  onClick={() => {
                    editProblem(problem.id, { askMarkdown: draft })
                    setDraft(undefined)
                  }}
                >
                  Save
                </button>
                <button className="secondary" onClick={() => setDraft(undefined)}>Cancel</button>
              </div>
            </>
          )}
        </>
      )}
    </aside>
  )
}
