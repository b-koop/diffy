import { describe, expect, it } from 'vitest'
import type { Comment, Problem } from '../store'
import { buildReview, countsLine, reviewCounts, sortProblemsNewestFirst } from './review'

const diff = (file: string) => `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1 +1 @@\n-a\n+b\n`
const problem: Problem = {
  id: 'p',
  title: 'T',
  askMarkdown: '',
  candidates: [
    { id: 'c1', label: 'One', rawDiff: diff('a.ts') + diff('b.ts') },
    { id: 'c2', label: 'Two', rawDiff: diff('a.ts') },
  ],
}
const cm = (id: string, candidateId: string, file: string, lineNumber?: number, status?: Comment['status']): Comment => ({
  id,
  candidateId,
  file,
  ...(lineNumber !== undefined && { side: 'new' as const, lineNumber, snippet: '+b' }),
  tags: ['unclear_code'],
  body: id,
  createdAt: 0,
  status,
})
const comments = [
  cm('c2-a', 'c2', 'a.ts', 1),
  cm('c1-b', 'c1', 'b.ts', 1),
  cm('c1-a-line', 'c1', 'a.ts', 1, 'denied'),
  cm('c1-a-all', 'c1', 'a.ts'),
  cm('other', 'zzz', 'a.ts', 1),
]
const ids = (g: ReturnType<typeof buildReview>) => g.map((x) => x.items.map((i) => i.comment.id))

describe('landing page review order', () => {
  it('sorts recently added reviews before older reviews without mutating the source list', () => {
    const older = { ...problem, id: 'older', title: 'Older review' }
    const newer = { ...problem, id: 'newer', title: 'Newer review' }
    const reviews = [older, newer]

    expect(sortProblemsNewestFirst(reviews)).toEqual([newer, older])
    expect(reviews).toEqual([older, newer])
  })
})

describe('buildReview', () => {
  it('orders by candidate, then file, then whole-file before lines, and labels locations', () => {
    const r = buildReview(problem, comments)
    expect(r.map((g) => g.label)).toEqual(['One', 'Two'])
    expect(ids(r)).toEqual([['c1-a-all', 'c1-a-line', 'c1-b'], ['c2-a']])
    expect(r[0].items.map((i) => i.location)).toEqual(['all', '1', '1'])
  })

  it('filters by status, treating a missing status as approved', () => {
    expect(ids(buildReview(problem, comments, 'approved'))).toEqual([['c1-a-all', 'c1-b'], ['c2-a']])
    expect(ids(buildReview(problem, comments, 'denied'))).toEqual([['c1-a-line'], []])
  })
})

describe('reviewCounts', () => {
  it('counts the problem comments only', () => {
    const c = reviewCounts(problem, comments)
    expect(c).toEqual({ approved: 3, denied: 1 })
    expect(countsLine(c)).toBe('3 approved, 1 denied')
  })
})
