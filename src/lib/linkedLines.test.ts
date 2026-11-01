import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'
import { outputNotes } from './digest'
import { locationLabel } from './location'
import { parseDiff } from './parseDiff'
import { parseProblemFile, serializeProblem } from './problemFile'
import { makeLinkedSnippet, linkedPositions, type Pos } from './snippet'

const rawDiff = `diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1,5 +1,5 @@
 one
 two
-old
+new
 four
 five
@@ -11 +11 @@
 eleven
`
const parsed = parseDiff(rawDiff)
if (!parsed.ok) throw new Error(parsed.error)
const hunks = parsed.files[0].hunks
const lines: Pos[] = [{ side: 'new', lineNumber: 1 }, { side: 'new', lineNumber: 5 }, { side: 'new', lineNumber: 11 }]
const state = () => useStore.getState()
beforeEach(() => useStore.setState({ problems: [], comments: [], customTags: [] }))

describe('linked line comments', () => {
  it('reports separated lines without implying the intervening lines are selected', { tags: ['important', 'reporting'] }, () => {
    expect(locationLabel({ ...lines[0], lines }, hunks)).toBe('1,5,11')
    expect(makeLinkedSnippet(hunks, lines)).toBe(' one\n…\n five\n…\n eleven')
  })

  it('orders selections by diff position and treats both gutters of a context line as one line', { tags: ['reporting'] }, () => {
    const picked: Pos[] = [lines[2], { side: 'old', lineNumber: 1 }, lines[1], lines[0]]
    expect(linkedPositions(hunks, picked)).toEqual(lines)
    expect(locationLabel({ ...lines[0], lines: [{ side: 'new', lineNumber: 3 }, { side: 'old', lineNumber: 3 }] }, hunks)).toBe('-3,+3')
    expect(makeLinkedSnippet(hunks, [{ side: 'new', lineNumber: 99 }])).toBe('')
  })

  it('keeps one linked comment through output, export, and import', { tags: ['important', 'persistence', 'imports', 'exports'] }, () => {
    const problem = state().addProblem({ title: 'Review' })
    const candidate = state().addCandidate(problem.id, { label: 'A', rawDiff })
    state().addComment({ candidateId: candidate.id, file: 'a.ts', ...lines[0], lines, snippet: makeLinkedSnippet(hunks, lines), tags: ['unclear_code'], body: 'Same issue' })
    const current = state().problems[0]
    expect(outputNotes(current, state().comments)).toContain('a.ts[1,5,11]: Same issue')
    const exported = serializeProblem(current, state().comments, [])
    const imported = state().importProblem(parseProblemFile(exported))
    expect(state().comments.find((comment) => comment.candidateId === imported.candidates[0].id)?.lines).toEqual(lines)
  })

  it('keeps both removed and inserted addresses in output after exporting and importing', { tags: ['reporting', 'persistence', 'imports', 'exports'] }, () => {
    const problem = state().addProblem({ title: 'Review' })
    const candidate = state().addCandidate(problem.id, { label: 'A', rawDiff })
    const mixed: Pos[] = [{ side: 'old', lineNumber: 3 }, { side: 'new', lineNumber: 3 }]
    state().addComment({ candidateId: candidate.id, file: 'a.ts', ...mixed[0], lines: mixed, snippet: makeLinkedSnippet(hunks, mixed), tags: ['unclear_code'], body: 'Replacement issue' })
    const exported = serializeProblem(state().problems[0], state().comments, [])
    const imported = state().importProblem(parseProblemFile(exported))
    expect(outputNotes(imported, state().comments)).toContain('a.ts[-3,+3]: Replacement issue')
    expect(state().comments.find((comment) => comment.candidateId === imported.candidates[0].id)?.lines).toEqual(mixed)
  })

  it('rejects empty, duplicate, invalid, and conflicting linked anchors when saving or importing', { tags: ['validation', 'imports'] }, () => {
    const problem = state().addProblem({ title: 'Review' })
    const candidate = state().addCandidate(problem.id, { label: 'A', rawDiff })
    const base = { candidateId: candidate.id, file: 'a.ts', ...lines[0], snippet: ' one', tags: ['unclear_code'], body: '' }
    for (const bad of [[], [lines[0], lines[0]], [{ side: 'new', lineNumber: 0 }], [lines[1]]]) {
      expect(() => state().addComment({ ...base, lines: bad as Pos[] })).toThrow()
      const comment = { ...base, lines: bad, id: 'x', createdAt: 1 }
      expect(() => parseProblemFile(JSON.stringify({ version: 2, kind: 'diffy-problem', problem: state().problems[0], comments: [comment], customTags: [] }))).toThrow()
    }
    expect(() => state().addComment({ ...base, lines, end: lines[1] })).toThrow()
    expect(() => state().addComment({ candidateId: candidate.id, file: 'a.ts', lines, tags: ['unclear_code'], body: '' })).toThrow()
  })
})
