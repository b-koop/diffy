import { useState } from 'react'
import { useStore } from '../store'
import { parseProblemFile } from '../lib/problemFile'
import { sortProblemsNewestFirst } from '../lib/review'
import { exportProblem, readFile } from './util'

export function ProblemsList() {
  const { problems, addProblem, deleteProblem, importProblem } = useStore()
  const [title, setTitle] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const newestProblems = sortProblemsNewestFirst(problems)

  return (
    <main>
      <h1>Diffy</h1>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault()
          if (!title.trim()) return
          const p = addProblem({ title: title.trim() })
          setTitle('')
          window.location.hash = `/p/${p.id}`
        }}
      >
        <input aria-label="Review title" placeholder="New review title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button type="submit" disabled={!title.trim()}>Create new review</button>
      </form>
      {problems.length === 0 && <p className="muted">No reviews yet.</p>}
      <ul className="problems">
        {newestProblems.map((p) => (
          <li key={p.id}>
            <a href={`#/p/${p.id}`}>{p.title}</a>
            <span className="muted">{p.candidates.length} candidate(s)</span>
            <button className="link" onClick={() => exportProblem(p)}>Export</button>
            <button className="link" onClick={() => confirm(`Delete "${p.title}"?`) && deleteProblem(p.id)}>Delete</button>
          </li>
        ))}
      </ul>
      <div className="row">
        <label className="secondary btn">
          Import review
          <input
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              try {
                const p = importProblem(parseProblemFile(await readFile(f)))
                setError('')
                setDone(`Imported "${p.title}".`)
              } catch (err) {
                setDone('')
                setError(err instanceof Error ? err.message : String(err))
              }
            }}
          />
        </label>
      </div>
      {done && <p role="status">{done}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <footer className="muted">Data lives in this browser only. Export a review to share or back it up.</footer>
    </main>
  )
}
