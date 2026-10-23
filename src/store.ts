import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { del, get, set } from 'idb-keyval'
import { isBuiltIn, resolveTag } from './lib/categories'
import { nextCandidateLabel } from './lib/candidateLabel'
import { isPos, type ProblemFile } from './lib/problemFile'
import type { Pos, Side } from './lib/snippet'

export interface Candidate {
  id: string
  label: string
  rawDiff: string
  /** Free-text overall note for this candidate. */
  note?: string
}

export interface Problem {
  id: string
  title: string
  askMarkdown: string
  candidates: Candidate[]
}

export interface Comment {
  id: string
  candidateId: string
  file: string
  /** Line anchor. side, lineNumber and snippet are all present, or all absent for a whole-file comment. */
  side?: Side
  lineNumber?: number
  /** Range end (side/lineNumber above are the start). Absent for a single-line or whole-file comment. */
  end?: Pos
  snippet?: string
  /** Built-in category slugs and/or custom tag strings. At least one. */
  tags: string[]
  body: string
  createdAt: number
  /** Absent means approved. Denied comments stay stored but are left out of the output notes. */
  status?: CommentStatus
}

export type CommentStatus = 'approved' | 'denied'

export interface NewComment {
  candidateId: string
  file: string
  side?: Side
  lineNumber?: number
  end?: Pos
  snippet?: string
  tags: string[]
  body: string
}

export interface StoreData {
  problems: Problem[]
  comments: Comment[]
  customTags: string[]
}

interface Actions {
  addProblem(input: { title: string; askMarkdown?: string }): Problem
  editProblem(id: string, patch: Partial<Pick<Problem, 'title' | 'askMarkdown'>>): void
  deleteProblem(id: string): void
  addCandidate(problemId: string, input: { label: string; rawDiff: string }): Candidate
  editCandidate(problemId: string, candidateId: string, patch: Partial<Pick<Candidate, 'label' | 'rawDiff' | 'note'>>): void
  deleteCandidate(problemId: string, candidateId: string): void
  /** Throws if tags are empty or a body is missing when required. */
  addComment(input: NewComment): Comment
  /** Throws on the same validation as addComment. */
  editComment(id: string, patch: Partial<Pick<Comment, 'tags' | 'body' | 'end'>>): void
  deleteComment(id: string): void
  setCommentStatus(id: string, status: CommentStatus): void
  addCustomTag(tag: string): void
  /** Removes from the list only; existing comments keep the tag. */
  removeCustomTag(tag: string): void
  /** Adds a parsed problem file as a new problem with fresh ids; existing data is untouched. */
  importProblem(file: ProblemFile): Problem
}

export type Store = StoreData & Actions

const uid = () => crypto.randomUUID()

/** Dedupes case-insensitively, keeping the first casing. */
function dedupe(tags: string[]): string[] {
  const seen = new Set<string>()
  return tags.filter((t) => {
    const k = t.toLowerCase()
    if (!t || seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** Resolves built-ins, reuses the casing of known custom tags, dedupes. */
function normalizeTags(tags: string[], known: string[]): string[] {
  const resolved = tags.map(resolveTag).map((t) => known.find((k) => k.toLowerCase() === t.toLowerCase()) ?? t)
  return dedupe(resolved)
}

/** Either fully line-anchored (side + lineNumber + snippet, optional end) or whole-file (none of them). */
function validateAnchor(c: { side?: Side; lineNumber?: number; end?: Pos; snippet?: string }) {
  const set = [c.side, c.lineNumber, c.snippet].filter((v) => v !== undefined).length
  if (set === 0) {
    if (c.end !== undefined) throw new Error('A whole-file comment cannot have a range end.')
    return
  }
  if (set !== 3) throw new Error('A line comment needs a side, a line number and a snippet.')
  if (c.end === undefined) return
  if (!isPos(c.end)) throw new Error('A range end needs a side and a line number.')
  if (c.end.side === c.side && c.end.lineNumber === c.lineNumber) throw new Error('A range end must differ from its start.')
}

function validateCommentFields(tags: string[], body: string) {
  if (tags.length === 0) throw new Error('A comment needs at least one tag.')
  if (tags.some((t) => t === 'other' || !isBuiltIn(t)) && !body.trim()) {
    throw new Error('A comment with a custom tag or "other" needs a body.')
  }
}

/**
 * IndexedDB commits asynchronously and an uncommitted write is dropped when the page unloads, so each
 * write is mirrored synchronously to localStorage first and the mirror is cleared once IndexedDB has it.
 * A mirror found on load is a write that never committed: it is moved into IndexedDB and used.
 */
const mirror = {
  get: (name: string) => localStorage.getItem(name),
  put: (name: string, value: string) => {
    try {
      localStorage.setItem(name, value)
    } catch {
      localStorage.removeItem(name) // too big to mirror; never leave a stale copy behind
    }
  },
  clear: (name: string, value: string) => localStorage.getItem(name) === value && localStorage.removeItem(name),
}

const idbStorage = createJSONStorage<StoreData>(() => ({
  getItem: async (name) => {
    if (typeof indexedDB === 'undefined') return null
    const pending = mirror.get(name)
    if (pending !== null) {
      await set(name, pending)
      mirror.clear(name, pending)
      return pending
    }
    return (await get(name)) ?? null
  },
  setItem: async (name, value) => {
    if (typeof indexedDB === 'undefined') return
    mirror.put(name, value)
    await set(name, value)
    mirror.clear(name, value)
  },
  removeItem: async (name) => {
    localStorage.removeItem(name)
    if (typeof indexedDB !== 'undefined') await del(name)
  },
}))

const emptyData = (): StoreData => ({ problems: [], comments: [], customTags: [] })

export const useStore = create<Store>()(
  persist(
    (setState, getState) => {
      /** Normalizes tags, validates, and returns them with the updated custom tag list. */
      const prepareTags = (rawTags: string[], body: string) => {
        const { customTags } = getState()
        const tags = normalizeTags(rawTags, customTags)
        validateCommentFields(tags, body)
        const added = tags.filter((t) => !isBuiltIn(t))
        return { tags, customTags: dedupe([...customTags, ...added]) }
      }
      const patchProblem = (id: string, fn: (p: Problem) => Problem) =>
        setState((s) => ({ problems: s.problems.map((p) => (p.id === id ? fn(p) : p)) }))

      return {
        ...emptyData(),

        addProblem: ({ title, askMarkdown = '' }) => {
          const problem: Problem = { id: uid(), title, askMarkdown, candidates: [] }
          setState((s) => ({ problems: [...s.problems, problem] }))
          return problem
        },
        editProblem: (id, patch) => patchProblem(id, (p) => ({ ...p, ...patch })),
        deleteProblem: (id) =>
          setState((s) => {
            const gone = new Set(s.problems.find((p) => p.id === id)?.candidates.map((c) => c.id))
            return {
              problems: s.problems.filter((p) => p.id !== id),
              comments: s.comments.filter((c) => !gone.has(c.candidateId)),
            }
          }),

        addCandidate: (problemId, input) => {
          const candidates = getState().problems.find((p) => p.id === problemId)?.candidates ?? []
          const candidate: Candidate = { id: uid(), ...input, label: input.label.trim() || nextCandidateLabel(candidates) }
          patchProblem(problemId, (p) => ({ ...p, candidates: [...p.candidates, candidate] }))
          return candidate
        },
        editCandidate: (problemId, candidateId, patch) =>
          setState((s) => {
            const current = s.problems.find((p) => p.id === problemId)?.candidates.find((c) => c.id === candidateId)
            const replacesDiff = patch.rawDiff !== undefined && current !== undefined && current.rawDiff !== patch.rawDiff
            return {
              problems: s.problems.map((p) => {
                if (p.id !== problemId) return p
                return {
                  ...p,
                  candidates: p.candidates.map((c) => c.id === candidateId ? { ...c, ...patch } : c),
                }
              }),
              ...(replacesDiff && { comments: s.comments.filter((c) => c.candidateId !== candidateId) }),
            }
          }),
        deleteCandidate: (problemId, candidateId) => {
          patchProblem(problemId, (p) => ({ ...p, candidates: p.candidates.filter((c) => c.id !== candidateId) }))
          setState((s) => ({ comments: s.comments.filter((c) => c.candidateId !== candidateId) }))
        },

        addComment: (input) => {
          validateAnchor(input)
          const { tags, customTags } = prepareTags(input.tags, input.body)
          const comment: Comment = { ...input, tags, id: uid(), createdAt: Date.now() }
          setState((s) => ({ comments: [...s.comments, comment], customTags }))
          return comment
        },
        editComment: (id, patch) => {
          const existing = getState().comments.find((c) => c.id === id)
          if (!existing) return
          const next = { ...existing, ...patch }
          validateAnchor(next)
          const { tags, customTags } = prepareTags(next.tags, next.body)
          setState((s) => ({
            comments: s.comments.map((c) => (c.id === id ? { ...next, tags } : c)),
            customTags,
          }))
        },
        setCommentStatus: (id, status) =>
          setState((s) => ({ comments: s.comments.map((c) => (c.id === id ? { ...c, status } : c)) })),
        deleteComment: (id) => setState((s) => ({ comments: s.comments.filter((c) => c.id !== id) })),

        addCustomTag: (tag) => {
          const t = resolveTag(tag)
          if (!t || isBuiltIn(t)) return
          setState((s) => ({ customTags: dedupe([...s.customTags, t]) }))
        },
        removeCustomTag: (tag) =>
          setState((s) => ({ customTags: s.customTags.filter((t) => t.toLowerCase() !== tag.trim().toLowerCase()) })),

        importProblem: (file) => {
          const ids = new Map(file.problem.candidates.map((c) => [c.id, uid()]))
          const problem: Problem = {
            ...file.problem,
            id: uid(),
            candidates: file.problem.candidates.map((c) => ({ ...c, id: ids.get(c.id)! })),
          }
          const comments = file.comments.map((c) => ({ ...c, id: uid(), candidateId: ids.get(c.candidateId)! }))
          setState((s) => ({
            problems: [...s.problems, problem],
            comments: [...s.comments, ...comments],
            customTags: dedupe([...s.customTags, ...file.customTags.map(resolveTag)].filter((t) => !isBuiltIn(t))),
          }))
          return problem
        },
      }
    },
    {
      name: 'diffy',
      storage: idbStorage,
      partialize: ({ problems, comments, customTags }) => ({ problems, comments, customTags }),
    },
  ),
)
