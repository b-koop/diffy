import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from './store'
import type { NewComment } from './store'

const s = () => useStore.getState()

function seed() {
  const p = s().addProblem({ title: 'P', askMarkdown: 'ask' })
  const c = s().addCandidate(p.id, { label: 'A', rawDiff: 'diff' })
  const base: NewComment = {
    candidateId: c.id,
    file: 'a.ts',
    side: 'new',
    lineNumber: 1,
    snippet: '+x',
    tags: ['unclear_code'],
    body: '',
  }
  return { p, c, base }
}

beforeEach(() => {
  useStore.setState({ problems: [], comments: [], customTags: [] })
})

describe('custom tags', () => {
  it('trims, ignores empty, and dedupes case-insensitively keeping first casing', () => {
    s().addCustomTag('  CSS Leak ')
    s().addCustomTag('css leak')
    s().addCustomTag('   ')
    expect(s().customTags).toEqual(['CSS Leak'])
  })

  it('does not store built-in names as custom tags', () => {
    s().addCustomTag('Unclear code')
    expect(s().customTags).toEqual([])
  })

  it('removing a tag leaves existing comments intact', () => {
    const { base } = seed()
    s().addComment({ ...base, tags: ['css leak'], body: 'why' })
    s().removeCustomTag('CSS LEAK')
    expect(s().customTags).toEqual([])
    expect(s().comments[0].tags).toEqual(['css leak'])
  })
})

describe('candidate names and diff edits', () => {
  it('assigns the next unused letter when a new candidate name is blank', () => {
    const p = s().addProblem({ title: 'P' })
    expect(s().addCandidate(p.id, { label: '', rawDiff: 'one' }).label).toBe('A')
    expect(s().addCandidate(p.id, { label: 'Manual', rawDiff: 'two' }).label).toBe('Manual')
    expect(s().addCandidate(p.id, { label: '', rawDiff: 'three' }).label).toBe('B')
  })
})

describe('comments', () => {
  it('accepts a built-in tag without a body', () => {
    const { base } = seed()
    expect(s().addComment(base).tags).toEqual(['unclear_code'])
  })

  it('rejects a comment with no tags', () => {
    const { base } = seed()
    expect(() => s().addComment({ ...base, tags: [] })).toThrow()
  })

  it('requires a body for other or any custom tag', () => {
    const { base } = seed()
    expect(() => s().addComment({ ...base, tags: ['other'] })).toThrow()
    expect(() => s().addComment({ ...base, tags: ['unclear_code', 'css leak'], body: '  ' })).toThrow()
    expect(s().addComment({ ...base, tags: ['other'], body: 'because' }).tags).toEqual(['other'])
  })

  it('resolves custom text matching a built-in and dedupes tags', () => {
    const { base } = seed()
    const c = s().addComment({ ...base, tags: ['Unclear code', 'unclear_code', 'too_many_branches'] })
    expect(c.tags).toEqual(['unclear_code', 'too_many_branches'])
    expect(s().customTags).toEqual([])
  })

  it('adds new custom tags to the list on save, reusing known casing', () => {
    const { base } = seed()
    s().addComment({ ...base, tags: ['CSS Leak'], body: 'x' })
    const c = s().addComment({ ...base, tags: ['css leak'], body: 'y' })
    expect(c.tags).toEqual(['CSS Leak'])
    expect(s().customTags).toEqual(['CSS Leak'])
  })

  it('validates and registers tags on edit', () => {
    const { base } = seed()
    const c = s().addComment(base)
    expect(() => s().editComment(c.id, { tags: ['x tag'] })).toThrow()
    s().editComment(c.id, { tags: ['x tag'], body: 'b' })
    expect(s().customTags).toEqual(['x tag'])
  })

  it('replacing a candidate diff clears its comments', () => {
    const { p, c, base } = seed()
    s().addComment(base)
    s().editCandidate(p.id, c.id, { rawDiff: 'replacement diff' })
    expect(s().comments).toEqual([])
  })

  it('renaming a candidate leaves its comments intact', () => {
    const { p, c, base } = seed()
    const comment = s().addComment(base)
    s().editCandidate(p.id, c.id, { label: 'Approach A' })
    expect(s().comments).toEqual([comment])
  })

  it('deleting a candidate deletes its comments', () => {
    const { p, c, base } = seed()
    s().addComment(base)
    s().deleteCandidate(p.id, c.id)
    expect(s().comments).toEqual([])
  })
})

describe('range comments', () => {
  const end = { side: 'new' as const, lineNumber: 4 }

  it('stores a valid end and leaves single-line comments without one', () => {
    const { base } = seed()
    expect(s().addComment({ ...base, end }).end).toEqual(end)
    expect(s().addComment(base).end).toBeUndefined()
  })

  it('rejects a malformed end or one equal to the start', () => {
    const { base } = seed()
    expect(() => s().addComment({ ...base, end: { side: 'new', lineNumber: 1 } })).toThrow()
    expect(() => s().addComment({ ...base, end: { side: 'x', lineNumber: 2 } as never })).toThrow()
    expect(() => s().addComment({ ...base, end: { side: 'new', lineNumber: NaN } })).toThrow()
    expect(s().comments).toHaveLength(0)
  })

  it('validates end on edit', () => {
    const { base } = seed()
    const c = s().addComment({ ...base, end })
    expect(() => s().editComment(c.id, { end: { side: 'new', lineNumber: 1 } })).toThrow()
    expect(s().comments[0].end).toEqual(end)
  })
})

describe('whole-file comments', () => {
  it('accepts a comment with no anchor and rejects partial anchors or an end', () => {
    const { base } = seed()
    const { side, lineNumber, snippet, ...file } = base
    const c = s().addComment(file)
    expect(c).not.toHaveProperty('lineNumber')
    expect(() => s().addComment({ ...file, side })).toThrow()
    expect(() => s().addComment({ ...file, lineNumber })).toThrow()
    expect(() => s().addComment({ ...file, snippet })).toThrow()
    expect(() => s().addComment({ ...file, end: { side: 'new', lineNumber: 3 } })).toThrow()
    expect(() => s().addComment({ ...base, snippet: undefined })).toThrow()
    expect(s().comments).toHaveLength(1)
  })

  it('cannot gain a range end on edit, and still enforces tags and body', () => {
    const { base } = seed()
    const { side: _side, lineNumber: _lineNumber, snippet: _snippet, ...file } = base
    const c = s().addComment(file)
    expect(() => s().editComment(c.id, { end: { side: 'new', lineNumber: 3 } })).toThrow()
    expect(() => s().editComment(c.id, { tags: ['x tag'] })).toThrow()
    s().editComment(c.id, { body: 'edited' })
    expect(s().comments[0].body).toBe('edited')
  })
})

describe('comment status', () => {
  it('new comments are approved (no status stored)', () => {
    const { base } = seed()
    expect(s().addComment(base).status).toBeUndefined()
  })

  it('setCommentStatus denies and restores without deleting; editComment keeps status', () => {
    const { base } = seed()
    const c = s().addComment(base)
    s().setCommentStatus(c.id, 'denied')
    expect(s().comments).toHaveLength(1)
    expect(s().comments[0].status).toBe('denied')
    s().editComment(c.id, { tags: ['unclear_code'], body: 'edited' })
    expect(s().comments[0]).toMatchObject({ status: 'denied', body: 'edited' })
    s().setCommentStatus(c.id, 'approved')
    expect(s().comments[0].status).toBe('approved')
  })
})
