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
  it('groups by file and marks files a candidate did not touch', () => {
    const d = buildDigest(problem, comments)
    expect(d.map((f) => f.file)).toEqual(['a.ts', 'b.ts'])
    const a = d[0].cells
    expect(a[0]).toMatchObject({ candidateId: 'c1', changed: true })
    expect(a[0].comments.map((c) => c.id)).toEqual(['1', '3'])
    expect(a[1]).toMatchObject({ candidateId: 'c2', changed: false, comments: [] })
    expect(d[1].cells[0].changed).toBe(false)
    expect(d[1].cells[1].changed).toBe(true)
  })

  it('filters by a built-in tag, matching comments that carry it among several', () => {
    const d = buildDigest(problem, comments, 'unclear_code')
    expect(d.map((f) => f.file)).toEqual(['a.ts'])
    expect(d[0].cells[0].comments.map((c) => c.id)).toEqual(['1'])
  })

  it('filters by a custom tag, case-insensitively', () => {
    const d = buildDigest(problem, comments, 'CSS LEAK')
    expect(d[0].cells[0].comments.map((c) => c.id)).toEqual(['1'])
  })

  it('lists each comment once when filtering by one of several tags', () => {
    const d = buildDigest(problem, comments, 'too_many_branches')
    const ids = d.flatMap((f) => f.cells.flatMap((c) => c.comments.map((x) => x.id)))
    expect(ids.sort()).toEqual(['2', '3'])
  })

  it('ignores comments for candidates outside the problem', () => {
    expect(buildDigest(problem, [cm('x', 'other', 'a.ts', ['unclear_code'])])).toEqual([])
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

  it('gives every digest comment a location, whole-file first', () => {
    const d = buildDigest(ranged, [single, range, whole])
    expect(d[0].cells[0].comments.map((c) => c.location)).toEqual(['all', '5-7', '6'])
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
