import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'
import { parseProblemFile, problemFileName, serializeProblem } from './problemFile'

const s = () => useStore.getState()
const snapshot = () => JSON.stringify({ p: s().problems, c: s().comments, t: s().customTags })

function seed(title = 'P') {
  const p = s().addProblem({ title, askMarkdown: 'ask' })
  const c = s().addCandidate(p.id, { label: 'A', rawDiff: 'diff' })
  s().editCandidate(p.id, c.id, { note: 'overall' })
  const line = { candidateId: c.id, file: 'a.ts', side: 'new' as const, lineNumber: 1, snippet: '+x', tags: ['unclear_code'], body: '' }
  return { p: s().problems.find((x) => x.id === p.id)!, c, line }
}

const exportOf = (p: ReturnType<typeof seed>['p']) => serializeProblem(p, s().comments, s().customTags)

beforeEach(() => {
  useStore.setState({ problems: [], comments: [], customTags: [] })
})

describe('problemFileName', () => {
  it('slugifies and falls back', () => {
    expect(problemFileName('  Fix: the Bug!! ')).toBe('fix-the-bug.diffy.json')
    expect(problemFileName('???')).toBe('problem.diffy.json')
  })
})

describe('serializeProblem', () => {
  it('contains only this problem, its comments and the custom tags they use', () => {
    const one = seed('one')
    const two = seed('two')
    s().addComment({ ...one.line, tags: ['css leak'], body: 'b' })
    s().addComment({ ...two.line, tags: ['other tag'], body: 'b' })
    s().addCustomTag('unused')
    const file = JSON.parse(exportOf(one.p))
    expect(file).toMatchObject({ version: 2, kind: 'diffy-problem', customTags: ['css leak'] })
    expect(file.problem.id).toBe(one.p.id)
    expect(file.comments).toHaveLength(1)
    expect(file.comments[0].candidateId).toBe(one.c.id)
    expect(file).not.toHaveProperty('problems')
  })
})

describe('importProblem', () => {
  it('round-trips note, status, ranges, whole-file comments and tags with fresh ids', () => {
    const { p, line } = seed()
    const { side, lineNumber, snippet, ...whole } = line
    s().addComment({ ...line, end: { side: 'new', lineNumber: 4 }, tags: ['css leak'], body: 'r' })
    const denied = s().addComment(whole)
    s().setCommentStatus(denied.id, 'denied')
    const json = exportOf(p)
    const before = { comments: s().comments, customTags: s().customTags }
    useStore.setState({ problems: [], comments: [], customTags: [] })

    const imported = s().importProblem(parseProblemFile(json))
    expect(imported.candidates[0]).toMatchObject({ label: 'A', note: 'overall' })
    expect(imported.id).not.toBe(p.id)
    const strip = (cs: typeof before.comments) => cs.map(({ id, candidateId, ...rest }) => rest)
    expect(strip(s().comments)).toEqual(strip(before.comments))
    expect(s().comments.every((c) => c.candidateId === imported.candidates[0].id)).toBe(true)
    expect(s().comments.find((c) => !c.snippet)?.status).toBe('denied')
    expect(s().customTags).toEqual(before.customTags)
  })

  it('importing twice, or alongside the original, creates separate copies with no id collisions', () => {
    const { p, line } = seed()
    s().addComment(line)
    const file = parseProblemFile(exportOf(p))
    s().importProblem(file)
    s().importProblem(file)
    expect(s().problems).toHaveLength(3)
    const ids = [...s().problems.flatMap((x) => [x.id, ...x.candidates.map((c) => c.id)]), ...s().comments.map((c) => c.id)]
    expect(new Set(ids).size).toBe(ids.length)
    for (const pr of s().problems) {
      const cands = new Set(pr.candidates.map((c) => c.id))
      expect(s().comments.filter((c) => cands.has(c.candidateId))).toHaveLength(1)
    }
  })

  it('merges custom tags into the saved list, deduped case-insensitively', () => {
    const { p, line } = seed()
    s().addComment({ ...line, tags: ['CSS Leak'], body: 'b' })
    const file = parseProblemFile(exportOf(p))
    useStore.setState({ customTags: ['css leak', 'mine'] })
    s().importProblem(file)
    expect(s().customTags).toEqual(['css leak', 'mine'])
    useStore.setState({ customTags: [] })
    s().importProblem(file)
    expect(s().customTags).toEqual(['CSS Leak'])
  })
})

describe('parseProblemFile', () => {
  const valid = () => {
    const { p, line } = seed()
    s().addComment(line)
    return JSON.parse(exportOf(p))
  }
  const reject = (v: unknown, msg?: RegExp) => {
    const before = snapshot()
    expect(() => parseProblemFile(typeof v === 'string' ? v : JSON.stringify(v))).toThrow(msg)
    expect(snapshot()).toBe(before)
  }

  it('rejects garbage, other kinds, other versions and wrong shapes', () => {
    const f = valid()
    reject('nope', /valid JSON/)
    reject('{}')
    reject({ ...f, kind: 'other' })
    reject({ ...f, version: 3 })
    reject({ ...f, problem: { ...f.problem, title: 5 } })
    reject({ ...f, customTags: 'x' })
  })

  it('rejects a whole-store v1 file with a clear message', () => {
    reject({ version: 1, problems: [], comments: [], customTags: [] }, /Export each review/)
  })

  it('rejects bad anchors, ends, tags, status and note', () => {
    const mutate = (fn: (f: any) => void) => {
      const f = valid()
      fn(f)
      reject(f)
    }
    mutate((f) => (f.comments[0].end = { side: 'new', lineNumber: 1 }))
    mutate((f) => (f.comments[0].end = 'x'))
    mutate((f) => delete f.comments[0].snippet)
    mutate((f) => (f.comments[0].tags = []))
    mutate((f) => (f.comments[0].status = 'maybe'))
    mutate((f) => (f.problem.candidates[0].note = 5))
  })

  it('rejects a comment on a candidate that is not in the file', () => {
    const f = valid()
    f.comments[0].candidateId = 'elsewhere'
    reject(f, /not in the file/)
  })
})
