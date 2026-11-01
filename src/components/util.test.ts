import { describe, expect, it } from 'vitest'
import { changeAt, lineOf, resolveClick, selectCommentLines } from './util'
import type { Hunk } from '../lib/parseDiff'

const hunk = {
  changes: [
    { type: 'normal', isNormal: true, oldLineNumber: 4, newLineNumber: 5, content: 'a' },
    { type: 'delete', isDelete: true, lineNumber: 5, content: 'b' },
    { type: 'insert', isInsert: true, lineNumber: 6, content: 'c' },
  ],
} as unknown as Hunk

describe('lineOf', () => {
  it('uses the clicked side for context lines', () => {
    const [ctx] = hunk.changes as never[]
    expect(lineOf(ctx, 'old')).toEqual({ side: 'old', lineNumber: 4 })
    expect(lineOf(ctx, 'new')).toEqual({ side: 'new', lineNumber: 5 })
  })
  it('forces the side for inserts and deletes', () => {
    expect(lineOf(hunk.changes[1] as never, 'new')).toEqual({ side: 'old', lineNumber: 5 })
    expect(lineOf(hunk.changes[2] as never, 'old')).toEqual({ side: 'new', lineNumber: 6 })
  })
})

describe('changeAt', () => {
  it('finds a change by side and line', () => {
    expect(changeAt([hunk], 'old', 5)?.content).toBe('b')
    expect(changeAt([hunk], 'new', 5)?.content).toBe('a')
    expect(changeAt([hunk], 'new', 99)).toBeUndefined()
  })
})

describe('resolveClick', () => {
  const second = { changes: [{ type: 'insert', isInsert: true, lineNumber: 50, content: 'z' }] } as unknown as Hunk
  const hunks = [hunk, second]
  const ctx = { side: 'new', lineNumber: 5 } as const
  const ins = { side: 'new', lineNumber: 6 } as const
  const del = { side: 'old', lineNumber: 5 } as const

  it('first click becomes the pending start', () => {
    expect(resolveClick(hunks, undefined, ctx)).toEqual({ kind: 'start', start: ctx })
  })
  it('clicking the start again is a single-line comment, even from the other side of a context line', () => {
    expect(resolveClick(hunks, ctx, ctx)).toEqual({ kind: 'single', start: ctx })
    expect(resolveClick(hunks, ctx, { side: 'old', lineNumber: 4 })).toEqual({ kind: 'single', start: ctx })
  })
  it('completes a range in the same hunk, mixing line kinds', () => {
    expect(resolveClick(hunks, ctx, ins)).toEqual({ kind: 'range', start: ctx, end: ins })
  })
  it('orders a backwards click by hunk position', () => {
    expect(resolveClick(hunks, ins, del)).toEqual({ kind: 'range', start: del, end: ins })
  })
  it('rejects a click in another hunk', () => {
    expect(resolveClick(hunks, ctx, { side: 'new', lineNumber: 50 })).toEqual({ kind: 'cross' })
  })
})


describe("comment line selection", () => {
  const first = { side: "new", lineNumber: 5 } as const
  const last = { side: "new", lineNumber: 6 } as const
  it("selects one line until a range is explicitly extended", { tags: ["important", "reporting"] }, () => {
    expect(selectCommentLines([hunk], undefined, first, false)).toEqual({ start: first })
    expect(selectCommentLines([hunk], { start: first }, last, false)).toEqual({ start: last })
    expect(selectCommentLines([hunk], { start: first }, last, true)).toEqual({ start: first, end: last })
  })
  it("orders backward ranges and rejects ranges across omitted lines", { tags: ["validation", "reporting"] }, () => {
    expect(selectCommentLines([hunk], { start: last }, first, true)).toEqual({ start: first, end: last })
    const second = { changes: [{ type: "insert", lineNumber: 50, content: "later" }] } as unknown as Hunk
    expect(selectCommentLines([hunk, second], { start: first }, { side: "new", lineNumber: 50 }, true)).toBeUndefined()
  })
})
