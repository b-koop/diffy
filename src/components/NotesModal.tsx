import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { copyTextToClipboard } from '../lib/clipboard'
import { outputNotes, outputSummary } from '../lib/digest'
import { useStore, type Problem } from '../store'

/** Mount to open; the text is generated from the store each time it mounts. */
export function NotesModal({ problem, onClose }: { problem: Problem; onClose(): void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [{ text, summary }] = useState(() => {
    const comments = useStore.getState().comments
    return { text: outputNotes(problem, comments), summary: outputSummary(problem, comments) }
  })
  const [status, setStatus] = useState('')

  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
  }, [])

  const copy = async () => {
    setStatus(await copyTextToClipboard(text) ? 'Copied' : 'Copy failed')
  }

  return (
    <dialog
      ref={ref}
      className="notes-modal"
      aria-label="Output notes"
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && ref.current?.close()}
    >
      <div className="notes-body">
        <p className="muted" data-testid="notes-summary">{summary}</p>
        <textarea readOnly aria-label="Output notes text" value={text} rows={16} />
        <div className="row">
          <button type="button" onClick={copy}>Copy</button>
          {status && <span role="status" className="muted">{status}</span>}
          <button type="button" className="secondary icon-button" aria-label="Close output notes" title="Close" onClick={() => ref.current?.close()}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
    </dialog>
  )
}
