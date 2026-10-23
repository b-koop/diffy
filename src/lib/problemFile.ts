import { isBuiltIn } from './categories'
import type { Pos } from './snippet'
import type { Candidate, Comment, Problem } from '../store'

export interface ProblemFile {
  version: 2
  kind: 'diffy-problem'
  problem: Problem
  comments: Comment[]
  customTags: string[]
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr)
const arrOf = <T,>(v: unknown, ok: (x: unknown) => x is T): v is T[] => Array.isArray(v) && v.every(ok)

export const isPos = (v: unknown): v is Pos => isObj(v) && (v.side === 'old' || v.side === 'new') && isNum(v.lineNumber)
const isCandidate = (v: unknown): v is Candidate =>
  isObj(v) && isStr(v.id) && isStr(v.label) && isStr(v.rawDiff) && (v.note === undefined || isStr(v.note))
const isProblem = (v: unknown): v is Problem =>
  isObj(v) && isStr(v.id) && isStr(v.title) && isStr(v.askMarkdown) && arrOf(v.candidates, isCandidate)
const isComment = (v: unknown): v is Comment =>
  isObj(v) &&
  isStr(v.id) &&
  isStr(v.candidateId) &&
  isStr(v.file) &&
  (v.side === undefined && v.lineNumber === undefined && v.snippet === undefined && v.end === undefined
    ? true
    : (v.side === 'old' || v.side === 'new') &&
      isNum(v.lineNumber) &&
      isStr(v.snippet) &&
      (v.end === undefined || (isPos(v.end) && !(v.end.side === v.side && v.end.lineNumber === v.lineNumber)))) &&
  isStrArr(v.tags) &&
  v.tags.length > 0 &&
  isStr(v.body) &&
  isNum(v.createdAt) &&
  (v.status === undefined || v.status === 'approved' || v.status === 'denied')

/** `<slugified-title>.diffy.json`, falling back to `problem.diffy.json`. */
export const problemFileName = (title: string) =>
  `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'problem'}.diffy.json`

/** One problem with only its own comments and the custom tags those comments use. */
export function serializeProblem(problem: Problem, comments: Comment[], customTags: string[]): string {
  const ids = new Set(problem.candidates.map((c) => c.id))
  const own = comments.filter((c) => ids.has(c.candidateId))
  const used = new Set(own.flatMap((c) => c.tags.map((t) => t.toLowerCase())))
  const file: ProblemFile = {
    version: 2,
    kind: 'diffy-problem',
    problem,
    comments: own,
    customTags: customTags.filter((t) => !isBuiltIn(t) && used.has(t.toLowerCase())),
  }
  return JSON.stringify(file, null, 2)
}

/** Throws a user-readable Error unless the text is a valid v2 review file. */
export function parseProblemFile(json: string): ProblemFile {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    throw new Error('Import is not valid JSON.')
  }
  if (isObj(data) && data.version === 1) {
    throw new Error('Unsupported file: whole-store exports are no longer supported. Export each review on its own.')
  }
  if (!isObj(data) || data.version !== 2 || data.kind !== 'diffy-problem') {
    throw new Error('Not a Diffy review file.')
  }
  if (!isProblem(data.problem) || !arrOf(data.comments, isComment) || !isStrArr(data.customTags)) {
    throw new Error('Review file has an unexpected shape.')
  }
  const ids = new Set(data.problem.candidates.map((c) => c.id))
  if (data.comments.some((c) => !ids.has(c.candidateId))) {
    throw new Error('Review file has a comment on a candidate that is not in the file.')
  }
  return data as unknown as ProblemFile
}
