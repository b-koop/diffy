import { describe, expect, it } from 'vitest'
import { categories, isBuiltIn, resolveTag } from './categories'

describe('tag resolution', () => {
  it('lists the built-in slugs in order, ending with other', () => {
    expect(categories).toHaveLength(13)
    expect(categories[0].slug).toBe('unnecessary_helpers')
    expect(categories.at(-1)?.slug).toBe('other')
  })

  it('resolves slug or label text, case-insensitively, to the built-in slug', () => {
    expect(resolveTag('  Unclear Code ')).toBe('unclear_code')
    expect(resolveTag('TOO_MANY_BRANCHES')).toBe('too_many_branches')
    expect(isBuiltIn('low value tests')).toBe(false)
    expect(isBuiltIn('low-value TESTS')).toBe(true)
  })

  it('leaves other text as a trimmed custom tag', () => {
    expect(resolveTag('  css leak ')).toBe('css leak')
    expect(isBuiltIn('css leak')).toBe(false)
  })
})
