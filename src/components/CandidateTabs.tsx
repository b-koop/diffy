import { useState } from 'react'
import { useStore, type Candidate, type Problem } from '../store'
import { nextCandidateLabel } from '../lib/candidateLabel'
import { readFile } from './util'

interface Props {
  problem: Problem
  selectedId?: string
  onSelect(id: string): void
}

function AddCandidate({ problem, onAdded, onCancel }: { problem: Problem; onAdded(id: string): void; onCancel(): void }) {
  const addCandidate = useStore((s) => s.addCandidate)
  const [label, setLabel] = useState(() => nextCandidateLabel(problem.candidates))
  const [diff, setDiff] = useState('')

  const load = async (file?: File) => {
    if (file) setDiff(await readFile(file))
  }
  return (
    <form
      className="add-candidate"
      onSubmit={(event) => {
        event.preventDefault()
        if (diff.trim()) onAdded(addCandidate(problem.id, { label: label.trim(), rawDiff: diff }).id)
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        void load(event.dataTransfer.files[0])
      }}
    >
      <input aria-label="Candidate name" placeholder="Name" value={label} onChange={(event) => setLabel(event.target.value)} />
      <textarea
        aria-label="Diff"
        rows={8}
        placeholder="Paste a git diff here, or drop a .diff / .patch file"
        value={diff}
        onChange={(event) => setDiff(event.target.value)}
      />
      <div className="row">
        <input type="file" accept=".diff,.patch,text/*" aria-label="Diff file" onChange={(event) => void load(event.target.files?.[0])} />
        <button type="submit" disabled={!diff.trim()}>Add candidate</button>
        <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

function EditCandidate({ problem, candidate, onCancel }: { problem: Problem; candidate: Candidate; onCancel(): void }) {
  const editCandidate = useStore((s) => s.editCandidate)
  const commentCount = useStore((s) => s.comments.filter((comment) => comment.candidateId === candidate.id).length)
  const [label, setLabel] = useState(candidate.label)
  const [diff, setDiff] = useState(candidate.rawDiff)

  const load = async (file?: File) => {
    if (file) setDiff(await readFile(file))
  }
  return (
    <form
      className="add-candidate"
      onSubmit={(event) => {
        event.preventDefault()
        if (!diff.trim()) return
        if (diff !== candidate.rawDiff && commentCount > 0 && !confirm('Replacing this diff will permanently remove its comments. Continue?')) return
        editCandidate(problem.id, candidate.id, { label: label.trim() || candidate.label, rawDiff: diff })
        onCancel()
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        void load(event.dataTransfer.files[0])
      }}
    >
      <input aria-label="Candidate name" value={label} onChange={(event) => setLabel(event.target.value)} />
      <textarea
        aria-label="Diff"
        rows={8}
        placeholder="Paste a git diff here, or drop a .diff / .patch file"
        value={diff}
        onChange={(event) => setDiff(event.target.value)}
      />
      <div className="row">
        <input type="file" accept=".diff,.patch,text/*" aria-label="Diff file" onChange={(event) => void load(event.target.files?.[0])} />
        <button type="submit" disabled={!diff.trim()}>Save candidate</button>
        <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

export function CandidateTabs({ problem, selectedId, onSelect }: Props) {
  const { deleteCandidate } = useStore()
  const [adding, setAdding] = useState(problem.candidates.length === 0)
  const [editing, setEditing] = useState(false)
  const selected = problem.candidates.find((candidate) => candidate.id === selectedId)

  return (
    <div>
      <div className="tabs" role="tablist">
        {problem.candidates.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            role="tab"
            aria-selected={candidate.id === selectedId}
            onClick={() => {
              onSelect(candidate.id)
              setAdding(false)
              setEditing(false)
            }}
          >
            {candidate.label}
          </button>
        ))}
        <button type="button" className="secondary" onClick={() => { setAdding(true); setEditing(false) }}>+ Add</button>
      </div>
      {adding && (
        <AddCandidate
          problem={problem}
          onAdded={(id) => {
            onSelect(id)
            setAdding(false)
          }}
          onCancel={() => setAdding(false)}
        />
      )}
      {!adding && selected && (
        <div className="row">
          {editing ? (
            <EditCandidate problem={problem} candidate={selected} onCancel={() => setEditing(false)} />
          ) : (
            <>
              <button type="button" className="link" onClick={() => setEditing(true)}>Edit candidate</button>
              <button
                type="button"
                className="link"
                onClick={() => confirm(`Delete "${selected.label}" and its comments?`) && deleteCandidate(problem.id, selected.id)}
              >
                Delete candidate
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
