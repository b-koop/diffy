import { describe, expect, it } from 'vitest'
import { canCreateTag, findSimilarTag, moveHighlight, suggestTags } from './suggest'

const tags = (q: string, custom: string[] = []) => suggestTags(q, custom).map((s) => s.tag)

describe('suggestTags', () => {
  it('lists everything for an empty query', () => {
    expect(tags('', ['css leak'])).toHaveLength(14)
  })
  it('finds a built-in by partial word, case-insensitively', () => {
    expect(tags('unclear')).toEqual(['unclear_code'])
    expect(tags('UNCLEAR cod')).toEqual(['unclear_code'])
  })
  it('orders exact, then prefix, then substring', () => {
    expect(tags('other', ['another thing', 'other thing'])).toEqual(['other', 'other thing', 'another thing'])
  })
  it('matches slugs and words in any order', () => {
    expect(tags('too_many')).toEqual(['too_many_branches'])
    expect(tags('branches many')).toEqual(['too_many_branches'])
  })
  it('includes saved custom tags and returns nothing for no match', () => {
    expect(tags('css', ['css leak'])).toEqual(['css leak'])
    expect(tags('zzzz')).toEqual([])
  })
})

describe('picker helpers', () => {
  it('offers Create only for new, non-empty, non-built-in text', () => {
    expect(canCreateTag('brand new', [])).toBe(true)
    expect(canCreateTag('  ', [])).toBe(false)
    expect(canCreateTag('Unclear code', [])).toBe(false)
    expect(canCreateTag('CSS Leak', ['css leak'])).toBe(false)
    expect(canCreateTag('unclear', [])).toBe(true)
  })
  it('clamps the highlight', () => {
    expect(moveHighlight(0, -1, 3)).toBe(0)
    expect(moveHighlight(1, 1, 3)).toBe(2)
    expect(moveHighlight(2, 1, 3)).toBe(2)
  })
})

describe('findSimilarTag', () => {
  const similar = (q: string, custom: string[] = [], selected: string[] = []) =>
    findSimilarTag(q, custom, selected)?.tag ?? null

  it.each([
    ['too many branch', 'too_many_branches'],
    ['too many ifs', 'too_many_branches'],
    ['nesting', 'too_many_branches'],
    ['dead code', 'dead_or_unrelated_code'],
    ['unused', 'dead_or_unrelated_code'],
    ['overengineered', 'premature_extensibility'],
    ['over-engineered', 'premature_extensibility'],
    ['copy pasted', 'duplicated_logic_or_state'],
    ['Copy-Paste!', 'duplicated_logic_or_state'],
    ['naming', 'unhelpful_comments_or_names'],
    ['bad variable names', 'unhelpful_comments_or_names'],
    ['unclear', 'unclear_code'],
    ['confusing code', 'unclear_code'],
    ['flaky test', 'low_value_tests'],
    ['wrong place', 'code_in_wrong_place'],
    ['try catch everywhere', 'excessive_defensiveness'],
    ['pass-through', 'unnecessary_helpers'],
    ['legacy', 'unneeded_backwards_compatibility'],
    ['redundant work', 'unnecessary_machinery_or_repeated_work'],
    ['premature extensiblity', 'premature_extensibility'],
  ])('maps %j to %s', (typed, tag) => {
    expect(similar(typed)).toBe(tag)
  })

  it('returns null for unrelated or empty text', () => {
    expect(similar('sql injection')).toBeNull()
    expect(similar('nitpick formatting')).toBeNull()
    expect(similar('   ')).toBeNull()
    expect(similar('code')).toBeNull()
    expect(similar('other code')).toBeNull()
  })
  it('returns null when the text is already an exact tag', () => {
    expect(similar('Too many branches')).toBeNull()
    expect(similar('too_many_branches')).toBeNull()
    expect(similar('css leak', ['css leak'])).toBeNull()
    expect(similar('CSS-Leak', ['css leak'])).toBeNull()
  })
  it('matches saved custom tags fuzzily', () => {
    expect(findSimilarTag('css leaks', ['css leak'])).toEqual({ tag: 'css leak', label: 'css leak', custom: true })
  })
  it('never returns an already selected tag', () => {
    expect(similar('nesting', [], ['too_many_branches'])).toBeNull()
    expect(similar('css leaks', ['css leak'], ['css leak'])).toBeNull()
  })
  it('flips at the 0.6 similarity threshold', () => {
    expect(similar('state mach', ['state machine'])).toBe('state machine')
    expect(similar('state mchn', ['state machine'])).toBeNull()
  })
})
