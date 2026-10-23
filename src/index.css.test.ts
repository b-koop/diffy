// Vitest runs in Node; the project does not include Node type declarations.
// @ts-expect-error Node's built-in filesystem module is available in the test runtime.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const styles = readFileSync(new URL('./index.css', import.meta.url), 'utf8')
const diffScroller = styles.match(/\.diff-scroll\s*\{([^}]*)\}/)?.[1] ?? ''
const diffCode = styles.match(/\.diff \.diff-code\s*\{([^}]*)\}/)?.[1] ?? ''

describe('diff line rendering', () => {
  it('keeps long comments on one line inside a horizontally scrollable diff', () => {
    expect(diffCode).toMatch(/white-space:\s*pre\s*;/)
    expect(diffCode).toMatch(/word-break:\s*normal\s*;/)
    expect(diffScroller).toMatch(/overflow-x:\s*auto\s*;/)
  })
})
