import type { Comment, Problem } from '../store'
import { byLine, isDenied } from './digest'
import { locationLabel } from './location'
import { parseDiff, type Hunk } from './parseDiff'

export type StatusFilter = 'all' | 'approved' | 'denied'

export interface ReviewItem {
  comment: Comment
  location: string
}

export interface ReviewGroup {
  candidateId: string
  label: string
  items: ReviewItem[]
}

/** Approved and denied counts over all of the problem's comments, ignoring any filter. */
export function reviewCounts(problem: Problem, comments: Comment[]) {
  const ids = new Set(problem.candidates.map((c) => c.id))
  const mine = comments.filter((c) => ids.has(c.candidateId))
  const denied = mine.filter(isDenied).length
  return { approved: mine.length - denied, denied }
}

/** "9 approved, 3 denied" */
export const countsLine = ({ approved, denied }: { approved: number; denied: number }) => `${approved} approved, ${denied} denied`

/** Reviews are appended in creation/import order; the landing page presents the newest first. */
export const sortProblemsNewestFirst = (problems: Problem[]): Problem[] =>
  problems.reduceRight<Problem[]>((newestFirst, problem) => {
    newestFirst.push(problem)
    return newestFirst
  }, [])

/**
 * The review list: per candidate (tab order), comments ordered by file, whole-file first, then line
 * (same order as the output notes). Candidates with nothing to show are kept so the structure stays stable.
 */
export function buildReview(problem: Problem, comments: Comment[], filter: StatusFilter = 'all'): ReviewGroup[] {
  return problem.candidates.map((cand) => {
    const hunksByFile = new Map<string, Hunk[]>()
    const parsed = parseDiff(cand.rawDiff)
    if (parsed.ok) parsed.files.forEach((f) => hunksByFile.set(f.path, f.hunks))
    const items = comments
      .filter((c) => c.candidateId === cand.id && (filter === 'all' || (filter === 'denied') === isDenied(c)))
      .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : byLine(a, b)))
      .map((comment) => ({ comment, location: locationLabel(comment, hunksByFile.get(comment.file) ?? []) }))
    return { candidateId: cand.id, label: cand.label, items }
  })
}
