import { useMemo, useState } from 'react'
import { buildReview, countsLine, reviewCounts, type StatusFilter } from '../lib/review'
import { isDenied } from '../lib/digest'
import { useStore, type Comment } from '../store'
import { CommentForm } from './CommentForm'
import { Chips, DeniedBadge, Snippet, StatusToggle } from './CommentView'
import { NotesModal } from './NotesModal'

function ReviewRow({ comment, location }: { comment: Comment; location: string }) {
  const editComment = useStore((s) => s.editComment)
  const deleteComment = useStore((s) => s.deleteComment)
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)

  if (editing) {
    return (
      <li className="comment">
        <div className="muted loc">{comment.file}[{location}]</div>
        <CommentForm
          initial={comment}
          submitLabel="Save"
          onSubmit={(tags, body) => {
            editComment(comment.id, { tags, body })
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    )
  }
  return (
    <li className={isDenied(comment) ? 'comment denied' : 'comment'}>
      <div className="muted loc">{comment.file}[{location}]{isDenied(comment) && <> <DeniedBadge /></>}</div>
      <Chips tags={comment.tags} />
      {comment.snippet && <Snippet text={comment.snippet} />}
      {comment.body && <p className="body">{comment.body}</p>}
      <div className="row">
        <StatusToggle comment={comment} />
        <button type="button" className="link" onClick={() => setEditing(true)}>Edit</button>
        {confirming ? (
          <>
            <span className="muted">Delete permanently?</span>
            <button type="button" className="link" onClick={() => deleteComment(comment.id)}>Confirm delete</button>
            <button type="button" className="link" onClick={() => setConfirming(false)}>Keep</button>
          </>
        ) : (
          <button type="button" className="link" onClick={() => setConfirming(true)}>Delete</button>
        )}
      </div>
    </li>
  )
}

export function Review({ id }: { id: string }) {
  const problem = useStore((s) => s.problems.find((p) => p.id === id))
  const comments = useStore((s) => s.comments)
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [notesOpen, setNotesOpen] = useState(false)

  const groups = useMemo(() => (problem ? buildReview(problem, comments, filter) : []), [problem, comments, filter])
  if (!problem) return <main><p>Review not found.</p><a href="#/">Back to reviews</a></main>

  return (
    <main className="review">
      <header className="bar">
        <a href={`#/p/${id}`}>‹ Workspace</a>
        <h1>{problem.title}: review</h1>
        <a href={`#/p/${id}/digest`}>Digest</a>
      </header>
      <div className="row toolbar">
        <label>
          Show{' '}
          <select aria-label="Status filter" value={filter} onChange={(e) => setFilter(e.target.value as StatusFilter)}>
            <option value="all">All</option>
            <option value="approved">Approved</option>
            <option value="denied">Denied</option>
          </select>
        </label>
        <span className="muted" data-testid="review-counts">{countsLine(reviewCounts(problem, comments))}</span>
        <button type="button" className="primary-big" onClick={() => setNotesOpen(true)}>Output notes</button>
      </div>
      {groups.every((g) => g.items.length === 0) && <p className="muted">No comments{filter === 'all' ? '' : ` that are ${filter}`}.</p>}
      {groups.filter((g) => g.items.length > 0).map((g) => (
        <section key={g.candidateId}>
          <h2>{g.label}</h2>
          <ul className="review-list">
            {g.items.map((i) => <ReviewRow key={i.comment.id} comment={i.comment} location={i.location} />)}
          </ul>
        </section>
      ))}
      {notesOpen && <NotesModal problem={problem} onClose={() => setNotesOpen(false)} />}
    </main>
  )
}
