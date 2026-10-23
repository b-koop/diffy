import { categories, isBuiltIn, resolveTag } from './categories'

export interface Suggestion {
  tag: string
  label: string
  custom: boolean
}

/** Lowercased, with underscores read as spaces so slugs and labels compare alike. */
const words = (s: string) => s.toLowerCase().replace(/_/g, ' ').trim()

/** 0 exact, 1 prefix, 2 substring, 3 every query word appears somewhere; undefined for no match. */
function rank(q: string, texts: string[]): number | undefined {
  const parts = q.split(/\s+/)
  const best = (fn: (t: string) => boolean) => texts.some(fn)
  if (best((t) => t === q)) return 0
  if (best((t) => t.startsWith(q))) return 1
  if (best((t) => t.includes(q))) return 2
  if (best((t) => parts.every((p) => t.includes(p)))) return 3
}

/** Built-in and saved custom tags matching the query, exact matches first, then prefix, substring, word match. */
export function suggestTags(query: string, customTags: string[]): Suggestion[] {
  const q = words(query)
  const all: Suggestion[] = [
    ...categories.map((c) => ({ tag: c.slug, label: c.label, custom: false })),
    ...customTags.map((t) => ({ tag: t, label: t, custom: true })),
  ]
  if (!q) return all
  return all
    .map((s) => ({ s, r: rank(q, [words(s.label), words(s.tag)]) }))
    .filter((x): x is { s: Suggestion; r: number } => x.r !== undefined)
    .sort((a, b) => a.r - b.r)
    .map((x) => x.s)
}

/** Hand-written phrases (any wording a reviewer might type) that point at a built-in tag. */
const SYNONYMS: Record<string, string[]> = {
  too_many_branches: ['ifs', 'if else', 'nesting', 'nested', 'branching'],
  dead_or_unrelated_code: ['dead', 'unused', 'leftover', 'unrelated'],
  unhelpful_comments_or_names: ['naming', 'names', 'rename', 'variable name', 'comment'],
  duplicated_logic_or_state: ['copy paste', 'copy pasted', 'duplicate', 'duplicated', 'dup', 'dupe'],
  premature_extensibility: ['overengineered', 'over engineered', 'overkill', 'premature', 'future proof'],
  excessive_defensiveness: ['defensive', 'over defensive', 'guard', 'try catch'],
  unnecessary_helpers: ['wrapper', 'passthrough', 'pass through', 'helper'],
  unclear_code: ['unclear', 'confusing', 'unreadable', 'hard to read', 'complex'],
  code_in_wrong_place: ['wrong place', 'misplaced', 'belongs elsewhere'],
  unneeded_backwards_compatibility: ['compat', 'legacy', 'deprecated', 'shim'],
  low_value_tests: ['flaky', 'weak test', 'useless test', 'brittle test', 'flaky test'],
  unnecessary_machinery_or_repeated_work: ['retry', 'cache', 'lock', 'worker', 'redundant work'],
}

/** Lowercase, underscores/hyphens as spaces, punctuation dropped, spaces collapsed. */
const normalize = (s: string) =>
  s.toLowerCase().replace(/[_-]/g, ' ').replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim()

const trigrams = (s: string) => {
  const p = `  ${s} `
  return new Set(Array.from({ length: p.length - 2 }, (_, i) => p.slice(i, i + 3)))
}

const dice = (a: number, b: number, shared: number) => (2 * shared) / (a + b)

function editSimilarity(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++)
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = row
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length)
}

/** Dice similarity over character trigrams or over words that are near-equal (edit similarity >= 0.7). */
function similarity(a: string, b: string): number {
  if (Math.min(a.length, b.length) / Math.max(a.length, b.length) < 0.5) return 0
  const ta = trigrams(a)
  const tb = trigrams(b)
  const tri = dice(ta.size, tb.size, [...ta].filter((g) => tb.has(g)).length)
  const wa = a.split(' ')
  const wb = [...b.split(' ')]
  let shared = 0
  for (const w of wa) {
    const i = wb.findIndex((x) => editSimilarity(w, x) >= 0.7)
    if (i >= 0) (shared++, wb.splice(i, 1))
  }
  return Math.max(tri, dice(wa.length, b.split(' ').length, shared))
}

/** Minimum fuzzy score for a "did you mean" hint: "css leaks"/"css leak" pass (0.89), unrelated pairs stay under 0.4. */
export const SIMILARITY_THRESHOLD = 0.6

/**
 * Best close-but-not-exact existing tag for the typed text (synonym phrase first, then fuzzy), or null.
 * Tags in `selected` are never returned.
 */
export function findSimilarTag(typed: string, customTags: string[], selected: string[] = []): Suggestion | null {
  const q = normalize(typed)
  if (!q) return null
  const taken = new Set(selected.map((t) => resolveTag(t).toLowerCase()))
  const all: Suggestion[] = [
    ...categories.map((c) => ({ tag: c.slug, label: c.label, custom: false })),
    ...customTags.map((t) => ({ tag: t, label: t, custom: true })),
  ]
  if (all.some((s) => normalize(s.tag) === q || normalize(s.label) === q)) return null
  const open = all.filter((s) => !taken.has(s.tag.toLowerCase()))
  const fuzzy = open.filter((s) => s.tag !== 'other')

  const padded = ` ${q} `
  let best: { s: Suggestion; len: number } | undefined
  for (const s of open)
    for (const phrase of SYNONYMS[s.tag] ?? [])
      if (padded.includes(` ${phrase} `) && phrase.length > (best?.len ?? 0)) best = { s, len: phrase.length }
  if (best) return best.s

  const scored = fuzzy.map((s) => ({ s, score: Math.max(similarity(q, normalize(s.label)), similarity(q, normalize(s.tag))) }))
  const top = scored.sort((a, b) => b.score - a.score)[0]
  return top && top.score >= SIMILARITY_THRESHOLD ? top.s : null
}

/** True when the text is non-empty and is neither a built-in nor an already saved custom tag. */
export const canCreateTag = (query: string, customTags: string[]): boolean => {
  const q = query.trim().toLowerCase()
  return q !== '' && !isBuiltIn(q) && !customTags.some((t) => t.toLowerCase() === q)
}

/** Moves the highlighted row by delta, clamped to 0..count-1. */
export const moveHighlight = (index: number, delta: number, count: number): number =>
  Math.max(0, Math.min(count - 1, index + delta))
