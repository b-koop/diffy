import type { Comment, Problem } from '../store'
import { resolveTag } from './categories'
import { locationLabel } from './location'
import { parseDiff, type Hunk } from './parseDiff'

/** A comment plus its location, e.g. "12", "-3", "12-18" or "all". */
export type DigestComment = Comment & { location: string }

export interface DigestCell {
  candidateId: string
  /** False when the candidate's diff does not touch this file. */
  changed: boolean
  comments: DigestComment[]
}

export interface DigestFile {
  file: string
  cells: DigestCell[]
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
export function buildDigest(problem: Problem, comments: Comment[], tag?: string): DigestFile[] {
  const ids = new Set(problem.candidates.map((c) => c.id))
  const kept = comments.filter((c) => ids.has(c.candidateId) && (!tag || hasTag(c, tag)))
  const parsedById = new Map(
    problem.candidates.map((cand) => {
      const parsed = parseDiff(cand.rawDiff)
      return [cand.id, new Map(parsed.ok ? parsed.files.map((f) => [f.path, f.hunks] as const) : [])] as const
    }),
  )
  const files = [...new Set(kept.map((c) => c.file))].sort()
  return files.map((file) => ({
    file,
    cells: problem.candidates.map((cand) => {
      const hunks = parsedById.get(cand.id)!.get(file)
      const mine = kept
        .filter((c) => c.file === file && c.candidateId === cand.id)
        .map((c): DigestComment => ({ ...c, location: locationLabel(c, hunks ?? []) }))
      return {
        candidateId: cand.id,
        changed: mine.length > 0 || hunks !== undefined,
        comments: mine.sort(byLine),
      }
    }),
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
