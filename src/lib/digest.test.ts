import { describe, expect, it } from 'vitest'
import type { Comment, Problem } from '../store'
import { buildDigest, outputNotes, outputSummary } from './digest'

const mk = (file: string) =>
  `diff --git a/${file} b/${file}\nindex 1..2 100644\n--- a/${file}\n+++ b/${file}\n@@ -1 +1 @@\n-a\n+b\n`

const problem: Problem = {
  id: 'p',
  title: 'Prob',
  askMarkdown: '',
  candidates: [
    { id: 'c1', label: 'One', rawDiff: mk('a.ts') },
    { id: 'c2', label: 'Two', rawDiff: mk('b.ts') },
  ],
}

const cm = (id: string, candidateId: string, file: string, tags: string[], lineNumber = 1): Comment => ({
  id,
  candidateId,
  file,
  side: 'new',
  lineNumber,
  snippet: '+b',
  tags,
  body: `body ${id}`,
  createdAt: 0,
})

const comments = [
  cm('1', 'c1', 'a.ts', ['unclear_code', 'css leak']),
  cm('2', 'c2', 'b.ts', ['too_many_branches']),
  cm('3', 'c1', 'a.ts', ['too_many_branches'], 5),
]

describe('buildDigest', () => {
  it('groups by file and aligns exact locations with empty candidate cells', () => {
    const d = buildDigest(problem, comments)
    expect(d.map((file) => file.file)).toEqual(['a.ts', 'b.ts'])
    const a = d[0].rows
    expect(a.map((row) => row.location)).toEqual(['1', '5'])
    expect(a[0].cells[0]).toMatchObject({ candidateId: 'c1', changed: true, comments: [comments[0]] })
    expect(a[0].cells[1]).toMatchObject({ candidateId: 'c2', changed: false, comments: [] })
    expect(d[1].rows[0].cells[0].changed).toBe(false)
    expect(d[1].rows[0].cells[1].changed).toBe(true)
  })

  it('filters by a built-in tag, matching comments that carry it among several', () => {
    const d = buildDigest(problem, comments, 'unclear_code')
    expect(d.map((file) => file.file)).toEqual(['a.ts'])
    expect(d[0].rows[0].cells[0].comments.map((comment) => comment.id)).toEqual(['1'])
  })

  it('filters by a custom tag, case-insensitively', () => {
    const d = buildDigest(problem, comments, 'CSS LEAK')
    expect(d[0].rows[0].cells[0].comments.map((comment) => comment.id)).toEqual(['1'])
  })

  it('lists each comment once when filtering by one of several tags', () => {
    const d = buildDigest(problem, comments, 'too_many_branches')
    const ids = d.flatMap((file) => file.rows.flatMap((row) => row.cells.flatMap((cell) => cell.comments.map((comment) => comment.id))))
    expect(ids.sort()).toEqual(['2', '3'])
  })

  it('ignores comments for candidates outside the problem', () => {
    expect(buildDigest(problem, [cm('x', 'other', 'a.ts', ['unclear_code'])])).toEqual([])
  })
  it('sorts whole-file, numeric, signed and distinct selection locations without duplicating comments', () => {
    const invalid: Problem = { ...problem, candidates: problem.candidates.map((candidate) => ({ ...candidate, rawDiff: 'invalid' })) }
    const whole: Comment = { ...cm('whole', 'c1', 'f.ts', [], 1), side: undefined, lineNumber: undefined }
    const removed: Comment = { ...cm('removed', 'c1', 'f.ts', [], 6), side: 'old', lineNumber: 6 }
    const added = cm('added', 'c1', 'f.ts', [], 6)
    const ranged = { ...cm('range', 'c1', 'f.ts', [], 2), end: { side: 'new' as const, lineNumber: 4 } }
    const linked = { ...cm('linked', 'c1', 'f.ts', [], 2), lines: [{ side: 'new' as const, lineNumber: 2 }, { side: 'new' as const, lineNumber: 4 }] }
    const same = cm('same', 'c2', 'f.ts', [], 10)
    const d = buildDigest(invalid, [same, added, whole, removed, ranged, linked, cm('same2', 'c1', 'f.ts', [], 10)])
    expect(d[0].rows.map((row) => row.location)).toEqual(['all', '2-4', '2,4', '-6', '6', '10'])
    expect(d[0].rows[5].cells.map((cell) => cell.comments.map((comment) => comment.id))).toEqual([['same2'], ['same']])
    expect(d[0].rows[0].cells[0].comments).toEqual([whole])
  })

  it('intersects tag and status filters, treats missing status as approved, and drops empty results', () => {
    const approved = cm('approved', 'c1', 'a.ts', ['unclear_code'])
    const explicit = { ...cm('explicit', 'c1', 'a.ts', ['unclear_code'], 5), status: 'approved' as const }
    const denied: Comment = { ...cm('denied', 'c1', 'a.ts', ['unclear_code'], 7), status: 'denied' }
    const result = buildDigest(problem, [approved, explicit, denied], 'unclear_code', 'approved')
    expect(result[0].rows.flatMap((row) => row.cells.flatMap((cell) => cell.comments.map((comment) => comment.id)))).toEqual(['approved', 'explicit'])
    expect(buildDigest(problem, [denied], 'too_many_branches', 'denied')).toEqual([])
    expect(buildDigest(problem, [denied], undefined, 'approved')).toEqual([])
  })
})

describe('line locations', () => {
  const ranged: Problem = {
    ...problem,
    candidates: [
      {
        id: 'c1',
        label: 'One',
        rawDiff: 'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -5,3 +5,3 @@\n ctx\n-gone\n+added\n tail\n',
      },
    ],
  }
  const single = { ...cm('s', 'c1', 'a.ts', ['unclear_code'], 6), snippet: '+added' }
  const range = {
    ...cm('r', 'c1', 'a.ts', ['unclear_code'], 5),
    end: { side: 'new' as const, lineNumber: 7 },
    snippet: ' ctx\n-gone\n+added\n tail',
  }
  const whole: Comment = { ...cm('w', 'c1', 'a.ts', ['unclear_code']), side: undefined, lineNumber: undefined, snippet: undefined }

  it('groups by resolved location with whole-file rows first and numeric ordering', () => {
    const d = buildDigest(ranged, [single, range, whole])
    expect(d[0].rows.map((row) => row.location)).toEqual(['all', '5,-6,+6,7', '6'])
  })
})

describe('outputNotes', () => {
  const diff = (file: string) =>
    `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -5,4 +5,4 @@\n ctx\n-gone\n+added\n tail\n`
  const prob: Problem = {
    id: 'p',
    title: 'T',
    askMarkdown: '',
    candidates: [
      { id: 'a', label: 'A', rawDiff: diff('x.ts'), note: 'A is fine' },
      { id: 'b', label: 'B', rawDiff: diff('x.ts') + diff('y.ts') },
      { id: 'c', label: 'C', rawDiff: diff('x.ts') },
    ],
  }
  const mkc = (id: string, candidateId: string, file: string, tags: string[], p: Partial<Comment>, body = 'b'): Comment => ({
    id, candidateId, file, tags, body, createdAt: 0, snippet: 's', side: 'new', lineNumber: 5, ...p,
  })
  const file = (c: Comment): Comment => ({ ...c, side: undefined, lineNumber: undefined, snippet: undefined })

  it('groups by candidate in tab order with note, ordered comments and blank-line separators', () => {
    const out = outputNotes(prob, [
      mkc('1', 'b', 'y.ts', ['unclear_code'], { lineNumber: 6 }, 'later file'),
      mkc('2', 'b', 'x.ts', ['unclear_code', 'css leak'], { lineNumber: 6 }, 'added'),
      mkc('3', 'b', 'x.ts', ['too_many_branches'], { side: 'old', lineNumber: 6 }, 'removed'),
      file(mkc('4', 'b', 'x.ts', ['code_in_wrong_place'], {}, 'whole')),
      mkc('5', 'b', 'x.ts', ['unclear_code'], { lineNumber: 5, end: { side: 'old', lineNumber: 6 } }, 'range'),
      mkc('6', 'b', 'x.ts', ['unclear_code'], { lineNumber: 7 }, 'first\nsecond\nthird'),
    ])
    expect(out).toBe(
      [
        'A',
        'A is fine',
        '',
        'B',
        'code_in_wrong_place in x.ts[all]: whole',
        'unclear_code in x.ts[5 to -6]: range',
        'unclear_code, css leak in x.ts[6]: added',
        'too_many_branches in x.ts[-6]: removed',
        'unclear_code in x.ts[7]: first\n  second\n  third',
        'unclear_code in y.ts[6]: later file',
        '',
        'C',
      ].join('\n'),
    )
  })

  it('omits a blank note, ignores other problems and leaves no trailing text after the body when it is empty', () => {
    const out = outputNotes({ ...prob, candidates: [{ ...prob.candidates[0], note: '  ' }] }, [
      mkc('1', 'a', 'x.ts', ['unclear_code'], {}, ''),
      mkc('2', 'zzz', 'x.ts', ['unclear_code'], {}, 'other'),
    ])
    expect(out).toBe('A\nunclear_code in x.ts[5]:')
  })
})

describe('denied comments', () => {
  const p: Problem = { ...problem, candidates: [{ ...problem.candidates[0], note: 'overall' }] }
  const kept = cm('k', 'c1', 'a.ts', ['unclear_code'])
  const denied: Comment = { ...cm('d', 'c1', 'a.ts', ['too_many_branches'], 5), status: 'denied' }

  it('leaves denied comments out of the output notes, other lines unchanged', () => {
    const withBoth = outputNotes(p, [kept, denied])
    expect(withBoth).toBe(outputNotes(p, [kept]))
    expect(withBoth).toContain('body k')
    expect(withBoth).not.toContain('body d')
  })

  it('still prints the label and note when every comment is denied', () => {
    expect(outputNotes(p, [denied])).toBe('One\noverall')
  })

  it('treats an explicit approved status like a missing one', () => {
    expect(outputNotes(p, [{ ...kept, status: 'approved' }])).toBe(outputNotes(p, [kept]))
  })

  it('summarises included and denied counts', () => {
    expect(outputSummary(p, [kept, denied, cm('x', 'other', 'a.ts', ['unclear_code'])])).toBe('1 comment included, 1 denied (excluded)')
    expect(outputSummary(p, [])).toBe('0 comments included, 0 denied (excluded)')
  })
})
