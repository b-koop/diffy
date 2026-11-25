import { useState } from 'react'
import { isDenied } from '../lib/digest'
import { buildCommentAnchorPatch, type CommentAnchorDraft } from '../lib/commentAnchor'
import { parseDiff } from '../lib/parseDiff'
import { useStore, type Comment } from '../store'
import { CommentForm } from './CommentForm'
import { Chips, DeniedBadge, Snippet, StatusToggle } from './CommentView'

export function CommentCard({ comment, location, codeVisible = true, onToggleCode, rawDiff }: {
  comment: Comment
  location: string
  codeVisible?: boolean
  onToggleCode?: () => void
  rawDiff?: string
}) {
  const editComment = useStore((s) => s.editComment)
  const deleteComment = useStore((s) => s.deleteComment)
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const visible = editing || codeVisible
  const anchor: CommentAnchorDraft | undefined = comment.side !== undefined && comment.lineNumber !== undefined
    ? { side: comment.side, lineNumber: comment.lineNumber, end: comment.end, lines: comment.lines }
    : undefined

  return (
    <div className={isDenied(comment) ? 'comment denied' : 'comment'}>
      <div className="muted loc">{comment.file}[{location}]{isDenied(comment) && <> <DeniedBadge /></>}</div>
      {comment.snippet && <>
        {!editing && onToggleCode && <div className="row">
          <button type="button" className="link" aria-expanded={visible} aria-controls={`review-code-${comment.id}`} onClick={onToggleCode}>
            {visible ? 'Hide code' : 'Show code'}
          </button>
        </div>}
        <div id={`review-code-${comment.id}`} hidden={!visible}><Snippet text={comment.snippet} /></div>
      </>}
      {editing ? <CommentForm initial={comment} anchor={rawDiff ? anchor : undefined} submitLabel="Save" onSubmit={(tags, body, editedAnchor) => {
        const anchorPatch = rawDiff && editedAnchor
          ? (() => {
              const parsed = parseDiff(rawDiff)
              if (!parsed.ok) throw new Error('Cannot edit this line anchor because the candidate diff is invalid.')
              const hunks = parsed.files.find((file) => file.path === comment.file)?.hunks ?? []
              return buildCommentAnchorPatch(hunks, editedAnchor)
            })()
          : {}
        editComment(comment.id, { tags, body, ...anchorPatch })
        setEditing(false)
      }} onCancel={() => setEditing(false)} /> : <>
        <Chips tags={comment.tags} />
        {comment.body && <p className="body">{comment.body}</p>}
        <div className="row">
          <StatusToggle comment={comment} />
          <button type="button" className="link" onClick={() => setEditing(true)}>Edit</button>
          {confirming ? <>
            <span className="muted">Delete permanently?</span>
            <button type="button" className="link" onClick={() => deleteComment(comment.id)}>Confirm delete</button>
            <button type="button" className="link" onClick={() => setConfirming(false)}>Keep</button>
          </> : <button type="button" className="link" onClick={() => setConfirming(true)}>Delete</button>}
        </div>
      </>}
    </div>
  )
}
