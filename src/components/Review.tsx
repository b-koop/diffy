import { useMemo, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { buildReview, countsLine, reviewCounts, type StatusFilter } from '../lib/review'
import { useStore } from '../store'
import { CommentCard } from './CommentCard'
import { NotesModal } from './NotesModal'


export function Review({ id }: { id: string }) {
  const problem = useStore((s) => s.problems.find((p) => p.id === id))
  const comments = useStore((s) => s.comments)
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [notesOpen, setNotesOpen] = useState(false)
  const [hiddenCode, setHiddenCode] = useState<Set<string>>(() => new Set())

  const groups = useMemo(() => (problem ? buildReview(problem, comments, filter) : []), [problem, comments, filter])
  const candidateDiffs = useMemo(() => new Map(problem?.candidates.map((candidate) => [candidate.id, candidate.rawDiff] as const) ?? []), [problem])
  if (!problem) return <main><p>Review not found.</p><a href="#/">Back to reviews</a></main>

  return (
    <main className="review">
      <header className="bar">
        <a className="back-link" href={`#/p/${id}`}><ArrowLeft size={16} aria-hidden="true" />Workspace</a>
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
        <button type="button" className="secondary" onClick={() => setHiddenCode(new Set(comments.filter((comment) => problem.candidates.some((candidate) => candidate.id === comment.candidateId) && comment.snippet).map((comment) => comment.id)))}>Hide all code</button>
        <button type="button" className="secondary" onClick={() => setHiddenCode(new Set())}>Show all code</button>
        <button type="button" className="primary-big" onClick={() => setNotesOpen(true)}>Output notes</button>
      </div>
      {groups.every((g) => g.items.length === 0) && <p className="muted">No comments{filter === 'all' ? '' : ` that are ${filter}`}.</p>}
      {groups.filter((g) => g.items.length > 0).map((g) => {
        return (
          <section key={g.candidateId}>
            <h2>{g.label}</h2>
            <ul className="review-list">
              {g.items.map((i) => {
                return <li key={i.comment.id}><CommentCard comment={i.comment} location={i.location} rawDiff={candidateDiffs.get(g.candidateId)} hunks={i.hunks} codeVisible={!hiddenCode.has(i.comment.id)} onToggleCode={() => setHiddenCode((current) => {
                  const next = new Set(current)
                  if (next.has(i.comment.id)) next.delete(i.comment.id)
                  else next.add(i.comment.id)
                  return next
                })} /></li>
              })}
            </ul>
          </section>
        )
      })}
      {notesOpen && <NotesModal problem={problem} onClose={() => setNotesOpen(false)} />}
    </main>
  )
}
