import type { Comment, Problem } from '../store'
import { resolveTag } from './categories'
import { locationLabel } from './location'
import { parseDiff, type Hunk } from './parseDiff'
import type { StatusFilter } from './review'

export interface DigestCell {
  candidateId: string
  /** False when the candidate's diff does not touch this file or have comments there. */
  changed: boolean
  comments: Comment[]
}

export interface DigestRow {
  location: string
  cells: DigestCell[]
}

export interface DigestFile {
  file: string
  rows: DigestRow[]
}

/** Case-insensitive; built-in labels resolve to slugs, so "Unclear code" matches `unclear_code`. */

const hasTag = (c: Comment, tag: string) => {
  const want = resolveTag(tag).toLowerCase()
  return c.tags.some((t) => resolveTag(t).toLowerCase() === want)
}

/**
 * Groups the problem's comments by file, with one cell per candidate (in candidate order).
 * `tag` keeps only comments that carry that tag; files left with no comments are dropped.
 */
export function buildDigest(problem: Problem, comments: Comment[], tag?: string, filter: StatusFilter = 'all'): DigestFile[] {
  const candidateIds = new Set(problem.candidates.map((candidate) => candidate.id))
  const scoped = comments.filter((comment) => candidateIds.has(comment.candidateId))
  const parsedById = new Map(
    problem.candidates.map((candidate) => {
      const parsed = parseDiff(candidate.rawDiff)
      return [candidate.id, new Map(parsed.ok ? parsed.files.map((file) => [file.path, file.hunks] as const) : [])] as const
    }),
  )
  const changedFiles = new Map<string, Set<string>>()
  for (const comment of scoped) {
    const changedBy = changedFiles.get(comment.candidateId) ?? new Set<string>()
    changedBy.add(comment.file)
    changedFiles.set(comment.candidateId, changedBy)
  }
  const kept = scoped.filter((comment) =>
    (!tag || hasTag(comment, tag)) && (filter === 'all' || (filter === 'denied') === isDenied(comment)),
  )
  const grouped = new Map<string, Map<string, Map<string, Comment[]>>>()
  for (const comment of kept) {
    const hunks = parsedById.get(comment.candidateId)!.get(comment.file)
    const location = locationLabel(comment, hunks ?? [])
    let byLocation = grouped.get(comment.file)
    if (!byLocation) grouped.set(comment.file, (byLocation = new Map()))
    let byCandidate = byLocation.get(location)
    if (!byCandidate) byLocation.set(location, (byCandidate = new Map()))
    const cellComments = byCandidate.get(comment.candidateId) ?? []
    cellComments.push(comment)
    byCandidate.set(comment.candidateId, cellComments)
  }
  return [...grouped].sort(([a], [b]) => a.localeCompare(b)).map(([file, byLocation]) => ({
    file,
    rows: [...byLocation].sort(([a], [b]) => {
      if (a === 'all') return b === 'all' ? 0 : -1
      if (b === 'all') return 1
      const lineA = Math.min(...[...byLocation.get(a)!.values()].flat().map((comment) => comment.lineNumber ?? Infinity))
      const lineB = Math.min(...[...byLocation.get(b)!.values()].flat().map((comment) => comment.lineNumber ?? Infinity))
      return lineA - lineB || a.localeCompare(b)
    }).map(([location, byCandidate]) => ({
      location,
      cells: problem.candidates.map((candidate) => ({
        candidateId: candidate.id,
        changed: parsedById.get(candidate.id)!.has(file) || changedFiles.get(candidate.id)?.has(file) === true,
        comments: byCandidate.get(candidate.id) ?? [],
      })),
    })),
  }))
}

/** A missing status means approved. */
export const isDenied = (c: Comment) => c.status === 'denied'

/** Whole-file comments first, then by start line. */
export const byLine = (a: Comment, b: Comment) => (a.lineNumber ?? -Infinity) - (b.lineNumber ?? -Infinity)

const indent = (body: string) => body.split('\n').join('\n  ')

/** One-line summary for the notes modal, e.g. "12 comments included, 3 denied (excluded)". */
export function outputSummary(problem: Problem, comments: Comment[]): string {
  const ids = new Set(problem.candidates.map((c) => c.id))
  const mine = comments.filter((c) => ids.has(c.candidateId))
  const denied = mine.filter(isDenied).length
  const included = mine.length - denied
  return `${included} comment${included === 1 ? '' : 's'} included, ${denied} denied (excluded)`
}

/**
 * The plain-text "output notes": per candidate (in tab order) its label, overall note, then one entry
 * per comment ordered by file, whole-file first, then line. Continuation lines of a body are indented.
 */
export function outputNotes(problem: Problem, comments: Comment[]): string {
  return problem.candidates
    .map((cand) => {
      const hunksByFile = new Map<string, Hunk[]>()
      const parsed = parseDiff(cand.rawDiff)
      if (parsed.ok) parsed.files.forEach((f) => hunksByFile.set(f.path, f.hunks))
      const lines = comments
        .filter((c) => c.candidateId === cand.id && !isDenied(c))
        .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : byLine(a, b)))
        .map((c) => {
          const where = `${c.tags.join(', ')} in ${c.file}[${locationLabel(c, hunksByFile.get(c.file) ?? [])}]:`
          return c.body.trim() ? `${where} ${indent(c.body.trim())}` : where
        })
      return [cand.label, ...(cand.note?.trim() ? [cand.note.trim()] : []), ...lines].join('\n')
    })
    .join('\n\n')
}
