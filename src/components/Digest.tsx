import { useMemo, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { categories, tagLabel } from '../lib/categories'
import { buildDigest } from '../lib/digest'
import type { StatusFilter } from '../lib/review'
import { useStore } from '../store'
import { CommentCard } from './CommentCard'
import { NotesModal } from './NotesModal'

export function Digest({ id }: { id: string }) {
  const problem = useStore((s) => s.problems.find((p) => p.id === id))
  const comments = useStore((s) => s.comments)
  const [tag, setTag] = useState('')
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [notesOpen, setNotesOpen] = useState(false)
  const digest = useMemo(() => problem ? buildDigest(problem, comments, tag || undefined, filter) : [], [problem, comments, tag, filter])
  const candidateIds = useMemo(() => new Set(problem?.candidates.map((candidate) => candidate.id) ?? []), [problem])
  const candidateDiffs = useMemo(() => new Map(problem?.candidates.map((candidate) => [candidate.id, candidate.rawDiff] as const) ?? []), [problem])
  const customInUse = useMemo(() => {
    const builtIn = new Set(categories.map((category) => category.slug as string))
    return [...new Set(comments.filter((comment) => candidateIds.has(comment.candidateId)).flatMap((comment) => comment.tags).filter((value) => !builtIn.has(value)))].sort()
  }, [comments, candidateIds])
  if (!problem) return <main><p>Review not found.</p><a href="#/">Back to reviews</a></main>

  return (
    <main className="digest">
      <header className="bar">
        <a className="back-link" href={`#/p/${id}`}><ArrowLeft size={16} aria-hidden="true" />Workspace</a>
        <h1>{problem.title}: digest</h1>
      </header>
      <div className="row toolbar">
        <label>Tag{' '}
          <select value={tag} onChange={(event) => setTag(event.target.value)}>
            <option value="">All tags</option>
            {categories.map((category) => <option key={category.slug} value={category.slug}>{category.label}</option>)}
            {customInUse.map((value) => <option key={value} value={value}>{tagLabel(value)}</option>)}
          </select>
        </label>
        <label>Show{' '}
          <select aria-label="Status filter" value={filter} onChange={(event) => setFilter(event.target.value as StatusFilter)}>
            <option value="all">All</option><option value="approved">Approved</option><option value="denied">Denied</option>
          </select>
        </label>
        <a className="btn" href={`#/p/${id}/review`}>Review</a>
        <button onClick={() => setNotesOpen(true)}>Output notes</button>
      </div>
      <p className="muted">Comments are stored in this browser only. Export the review from the workspace to share or back it up.</p>
      {digest.length === 0 && <p className="muted">No comments{tag ? ` with tag “${tagLabel(tag)}”` : ''}{filter === 'all' ? '' : ` that are ${filter}`}.</p>}
      {digest.map(({ file, rows }, fileIndex) => {
        const headingId = `digest-file-${fileIndex}`
        return <section className="digest-file" key={file}>
          <h2 className="path" id={headingId}>{file}</h2>
          <div className="digest-scroll">
            <table className="digest-table" aria-labelledby={headingId}>
              <thead><tr><th scope="col">Location</th>{problem.candidates.map((candidate) => <th scope="col" key={candidate.id}>{candidate.label}</th>)}</tr></thead>
              <tbody>{rows.map((row) => <tr key={row.location}>
                <th scope="row">{file}[{row.location}]</th>
                {row.cells.map((cell) => <td key={cell.candidateId}>
                  {cell.comments.length ? cell.comments.map((comment) => <CommentCard key={comment.id} comment={comment} location={row.location} rawDiff={candidateDiffs.get(cell.candidateId)} />) : <p className="muted">{cell.changed ? 'no comments' : 'not changed'}</p>}
                </td>)}
              </tr>)}</tbody>
            </table>
          </div>
        </section>
      })}
      {notesOpen && <NotesModal problem={problem} onClose={() => setNotesOpen(false)} />}
    </main>
  )
}
