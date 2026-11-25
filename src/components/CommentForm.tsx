import { useState } from 'react'
import { isBuiltIn } from '../lib/categories'
import type { CommentAnchorDraft } from '../lib/commentAnchor'
import type { Side } from '../lib/snippet'
import { TagPicker } from './TagPicker'

interface Props {
  initial?: { tags: string[]; body: string }
  anchor?: CommentAnchorDraft
  submitLabel: string
  /** May throw; the message is shown inline. */
  onSubmit(tags: string[], body: string, anchor?: CommentAnchorDraft): void
  onCancel(): void
}

export function CommentForm({ initial, anchor, submitLabel, onSubmit, onCancel }: Props) {
  const [tags, setTags] = useState(initial?.tags ?? [])
  const [body, setBody] = useState(initial?.body ?? '')
  const [error, setError] = useState('')
  const [side, setSide] = useState<Side>(anchor?.side ?? 'new')
  const [lineNumber, setLineNumber] = useState(String(anchor?.lineNumber ?? ''))
  const [endSide, setEndSide] = useState<Side>(anchor?.end?.side ?? 'new')
  const [endLine, setEndLine] = useState(String(anchor?.end?.lineNumber ?? ''))
  const [linkedLines, setLinkedLines] = useState(anchor?.lines?.map((line) => `${line.side === 'old' ? '-' : '+'}${line.lineNumber}`).join(',') ?? '')
  const needsBody = tags.some((t) => t === 'other' || !isBuiltIn(t))

  const submit = () => {
    try {
      let nextAnchor: CommentAnchorDraft | undefined
      if (anchor) {
        if (!/^[1-9]\d*$/.test(lineNumber)) throw new Error('Enter a positive line number.')
        nextAnchor = { side, lineNumber: Number(lineNumber) }
        if (anchor.end) {
          if (!/^[1-9]\d*$/.test(endLine)) throw new Error('Enter a positive end line number.')
          nextAnchor.end = { side: endSide, lineNumber: Number(endLine) }
        }
        if (anchor.lines) {
          const values = linkedLines.split(',').map((value) => value.trim())
          if (!values.length || values.some((value) => !/^[-−+]?[1-9]\d*$/.test(value))) throw new Error('Enter linked lines such as 1,5 or -15,+24.')
          nextAnchor.lines = values.map((value) => ({ side: value.startsWith('-') || value.startsWith('−') ? 'old' : 'new', lineNumber: Number(value.replace(/^[-−+]/, '')) }))
        }
      }
      onSubmit(tags, body, nextAnchor)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <form
      className="comment-form"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <TagPicker value={tags} onChange={setTags} />
      {anchor && <fieldset className="comment-anchor-fields">
        <legend>Comment lines</legend>
        <label>Side <select aria-label="Comment line side" value={side} onChange={(event) => setSide(event.target.value as Side)}><option value="old">Old</option><option value="new">New</option></select></label>
        <label>Line number <input aria-label="Comment line number" type="number" min="1" step="1" value={lineNumber} onChange={(event) => setLineNumber(event.target.value)} /></label>
        {anchor.end && <>
          <label>End side <select aria-label="Comment end side" value={endSide} onChange={(event) => setEndSide(event.target.value as Side)}><option value="old">Old</option><option value="new">New</option></select></label>
          <label>End line number <input aria-label="Comment end line number" type="number" min="1" step="1" value={endLine} onChange={(event) => setEndLine(event.target.value)} /></label>
        </>}
        {anchor.lines && <label>Linked lines <input aria-label="Comment linked lines" value={linkedLines} onChange={(event) => setLinkedLines(event.target.value)} placeholder="1,5,11 or -15,+24" /></label>}
      </fieldset>}
      <textarea
        aria-label="Comment"
        rows={3}
        placeholder={needsBody ? 'Required: say what the issue is and why it matters' : 'Optional note'}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      {needsBody && !body.trim() && <p className="error">A comment with a custom tag or "Other" needs a body.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row">
        <button type="submit">{submitLabel}</button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

