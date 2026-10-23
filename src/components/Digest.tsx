import { useMemo, useState } from 'react'
import { categories, tagLabel } from '../lib/categories'
import { buildDigest } from '../lib/digest'
import { useStore } from '../store'
import { isDenied } from '../lib/digest'
import { Chips, DeniedBadge, Snippet } from './CommentView'
import { NotesModal } from './NotesModal'

export function Digest({ id }: { id: string }) {
  const problem = useStore((s) => s.problems.find((p) => p.id === id))
  const comments = useStore((s) => s.comments)
  const [tag, setTag] = useState('')
  const [notesOpen, setNotesOpen] = useState(false)

  const digest = useMemo(() => (problem ? buildDigest(problem, comments, tag || undefined) : []), [problem, comments, tag])
  const customInUse = useMemo(() => {
    const builtIn = new Set(categories.map((c) => c.slug as string))
    return [...new Set(comments.flatMap((c) => c.tags).filter((t) => !builtIn.has(t)))].sort()
  }, [comments])

  if (!problem) return <main><p>Review not found.</p><a href="#/">Back to reviews</a></main>

  return (
    <main className="digest">
      <header className="bar">
        <a href={`#/p/${id}`}>‹ Workspace</a>
        <h1>{problem.title}: digest</h1>
      </header>
      <div className="row toolbar">
        <label>
          Tag{' '}
          <select value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">All tags</option>
            {categories.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
            {customInUse.map((t) => <option key={t} value={t}>{tagLabel(t)}</option>)}
          </select>
        </label>
        <a className="btn" href={`#/p/${id}/review`}>Review</a>
        <button onClick={() => setNotesOpen(true)}>Output notes</button>
      </div>
      <p className="muted">Comments are stored in this browser only. Export the review from the workspace to share or back it up.</p>
      {digest.length === 0 && <p className="muted">No comments{tag ? ' with this tag' : ''}.</p>}
      {digest.map(({ file, cells }) => (
        <section className="digest-file" key={file}>
          <h2 className="path">{file}</h2>
          <div className="cols" style={{ ['--n' as string]: cells.length }}>
            {cells.map((cell) => (
              <div className="col" key={cell.candidateId}>
                <h3>{problem.candidates.find((c) => c.id === cell.candidateId)?.label}</h3>
                {!cell.changed && <p className="muted">not changed</p>}
                {cell.changed && cell.comments.length === 0 && <p className="muted">no comments</p>}
                {cell.comments.map((c) => (
                  <article className={isDenied(c) ? 'comment denied' : 'comment'} key={c.id}>
                    <div className="muted loc">{file}[{c.location}]{isDenied(c) && <> <DeniedBadge /></>}</div>
                    <Chips tags={c.tags} />
                    {c.snippet && <Snippet text={c.snippet} />}
                    {c.body && <p className="body">{c.body}</p>}
                  </article>
                ))}
              </div>
            ))}
          </div>
        </section>
      ))}
    {notesOpen && <NotesModal problem={problem} onClose={() => setNotesOpen(false)} />}
    </main>
  )
}
