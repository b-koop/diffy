import { useState } from 'react'
import { isBuiltIn } from '../lib/categories'
import { TagPicker } from './TagPicker'

interface Props {
  initial?: { tags: string[]; body: string }
  submitLabel: string
  /** May throw; the message is shown inline. */
  onSubmit(tags: string[], body: string): void
  onCancel(): void
}

export function CommentForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const [tags, setTags] = useState(initial?.tags ?? [])
  const [body, setBody] = useState(initial?.body ?? '')
  const [error, setError] = useState('')
  const needsBody = tags.some((t) => t === 'other' || !isBuiltIn(t))

  const submit = () => {
    try {
      onSubmit(tags, body)
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
