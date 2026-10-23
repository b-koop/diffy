import { useMemo } from 'react'
import 'react-diff-view/style/index.css'
import { parseDiff } from '../lib/parseDiff'
import { useStore, type Candidate } from '../store'
import { FileDiff } from './FileDiff'
import { summarizeDiffFiles } from '../lib/diffStats'

export function DiffView({ candidate, viewType, openAll, query, hoveredWord, selectedText, onHoverWord }: { candidate: Candidate; viewType: 'split' | 'unified'; openAll: { open: boolean; version: number }; query: string; hoveredWord?: string; selectedText?: string; onHoverWord(word?: string): void }) {
  const allComments = useStore((s) => s.comments)
  const comments = useMemo(() => allComments.filter((c) => c.candidateId === candidate.id), [allComments, candidate.id])
  const parsed = useMemo(() => parseDiff(candidate.rawDiff), [candidate.rawDiff])

  if (!parsed.ok) {
    return (
      <div>
        <p className="error">Could not parse this diff: {parsed.error}</p>
        <pre className="raw">{candidate.rawDiff}</pre>
      </div>
    )
  }
  const summary = summarizeDiffFiles(parsed.files)
  return (
    <div>
      <p className="muted diff-summary" aria-label={`Total diff size: ${summary.filesChanged} changed files, ${summary.additions} additions, ${summary.deletions} deletions`}>
        {summary.filesChanged} file{summary.filesChanged === 1 ? '' : 's'} changed · <span className="diff-insertions">+{summary.additions} additions</span> · <span className="diff-deletions">−{summary.deletions} deletions</span>
      </p>
      {parsed.files.map((f) => (
        <FileDiff key={f.path} file={f} candidateId={candidate.id} comments={comments} viewType={viewType} openAll={openAll} query={query} hoveredWord={hoveredWord} selectedText={selectedText} onHoverWord={onHoverWord} />
      ))}
    </div>
  )
}
