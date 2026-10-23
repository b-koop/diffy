import { useState } from 'react'
import { tagLabel } from '../lib/categories'
import { locationLabel } from '../lib/location'
import type { Hunk } from '../lib/parseDiff'
import { isDenied } from '../lib/digest'
import { useStore, type Comment } from '../store'
import { CommentForm } from './CommentForm'

export const Chips = ({ tags }: { tags: string[] }) => (
  <span className="chips">
    {tags.map((t) => (
      <span className="chip" key={t}>
        {tagLabel(t)}
      </span>
    ))}
  </span>
)

export const Snippet = ({ text }: { text: string }) => (
  <pre className="snippet">
    {text.split('\n').map((l, i) => (
      <span key={i} className={l[0] === '+' ? 'add' : l[0] === '-' ? 'del' : ''}>
        {l || ' '}
      </span>
    ))}
  </pre>
)

export const DeniedBadge = () => <span className="badge denied-badge">Denied</span>

/** One control that reflects the current state: "Deny" on an approved comment, "Approve" on a denied one. */
export function StatusToggle({ comment }: { comment: Comment }) {
  const setCommentStatus = useStore((s) => s.setCommentStatus)
  const denied = isDenied(comment)
  return (
    <button type="button" className="link" onClick={() => setCommentStatus(comment.id, denied ? 'approved' : 'denied')}>
      {denied ? 'Approve' : 'Deny'}
    </button>
  )
}

export function CommentView({ comment, hunks }: { comment: Comment; hunks: Hunk[] }) {
  const editComment = useStore((s) => s.editComment)
  const deleteComment = useStore((s) => s.deleteComment)
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <CommentForm
        initial={comment}
        submitLabel="Save"
        onSubmit={(tags, body) => {
          editComment(comment.id, { tags, body })
          setEditing(false)
        }}
        onCancel={() => setEditing(false)}
      />
    )
  }
  return (
    <div className={isDenied(comment) ? 'comment denied' : 'comment'}>
      <div className="muted loc">{locationLabel(comment, hunks)}{isDenied(comment) && <> <DeniedBadge /></>}</div>
      <Chips tags={comment.tags} />
      {comment.body && <p className="body">{comment.body}</p>}
      <div className="row">
        <StatusToggle comment={comment} />
        <button type="button" className="link" onClick={() => setEditing(true)}>
          Edit
        </button>
        <button type="button" className="link" onClick={() => deleteComment(comment.id)}>
          Delete
        </button>
      </div>
    </div>
  )
}
