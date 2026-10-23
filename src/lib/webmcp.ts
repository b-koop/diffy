import type { StoreApi } from 'zustand'
import { countLineChanges } from './diffStats'
import { parseDiff } from './parseDiff'
import { makeRangeSnippet, makeSnippet, type Pos, type Side } from './snippet'
import type { Store } from '../store'

export interface WebMcpTool {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean }
  execute(input: Record<string, unknown>, options: { signal: AbortSignal }): Promise<unknown>
}

export interface ModelContext {
  registerTool(tool: WebMcpTool, options?: { signal?: AbortSignal }): Promise<unknown>
}

type ReviewStore = Pick<StoreApi<Store>, 'getState'>
type ToolInput = Record<string, unknown>
type ToolContext = { signal: AbortSignal }

const emptySchema = { type: 'object', properties: {}, additionalProperties: false }
const readAnnotations = { readOnlyHint: true, untrustedContentHint: true }
const writeAnnotations = { readOnlyHint: false, untrustedContentHint: true }

const requiredString = (input: ToolInput, key: string): string => {
  const value = input[key]
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${key} is required.`)
  return value.trim()
}

const optionalString = (input: ToolInput, key: string): string | undefined => {
  const value = input[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new Error(`${key} must be a string.`)
  return value.trim() || undefined
}

const positiveLine = (value: unknown, label: string): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) throw new Error(`${label} must be a positive line number.`)
  return value
}

function findCandidate(store: ReviewStore, candidateId: string) {
  for (const problem of store.getState().problems) {
    const candidate = problem.candidates.find((item) => item.id === candidateId)
    if (candidate) return { problem, candidate }
  }
  throw new Error(`Candidate not found: ${candidateId}`)
}

function parsedCandidate(store: ReviewStore, candidateId: string) {
  const result = parseDiff(findCandidate(store, candidateId).candidate.rawDiff)
  if (!result.ok) throw new Error(`Could not parse candidate diff: ${result.error}`)
  return result.files
}

const schema = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
})

function tool(
  name: string,
  title: string,
  description: string,
  inputSchema: Record<string, unknown>,
  annotations: WebMcpTool['annotations'],
  execute: (input: ToolInput, options: ToolContext) => unknown | Promise<unknown>,
): WebMcpTool {
  return { name, title, description, inputSchema, annotations, execute: async (input, options) => execute(input, options) }
}

export function createReviewTools(store: ReviewStore): WebMcpTool[] {
  return [
    tool('list_reviews', 'List reviews', 'List reviews and their candidate labels and IDs.', emptySchema, readAnnotations, () => {
      const { problems, comments } = store.getState()
      return problems.map((problem) => ({
        id: problem.id,
        title: problem.title,
        candidates: problem.candidates.map(({ id, label }) => ({ id, label })),
        commentCount: comments.filter((comment) => problem.candidates.some((candidate) => candidate.id === comment.candidateId)).length,
      }))
    }),
    tool('get_review', 'Get review details', 'Read a review prompt and its candidates without their full diffs.', schema({ reviewId: { type: 'string' } }, ['reviewId']), readAnnotations, (input) => {
      const reviewId = requiredString(input, 'reviewId')
      const { problems, comments } = store.getState()
      const problem = problems.find((item) => item.id === reviewId)
      if (!problem) throw new Error(`Review not found: ${reviewId}`)
      return {
        id: problem.id,
        title: problem.title,
        askMarkdown: problem.askMarkdown,
        candidates: problem.candidates.map((candidate) => ({
          id: candidate.id,
          label: candidate.label,
          note: candidate.note,
          commentCount: comments.filter((comment) => comment.candidateId === candidate.id).length,
        })),
      }
    }),
    tool('list_files', 'List changed files', 'List changed files, change counts, and hunk counts for a candidate diff.', schema({ candidateId: { type: 'string' } }, ['candidateId']), readAnnotations, (input) => {
      const candidateId = requiredString(input, 'candidateId')
      const { problem, candidate } = findCandidate(store, candidateId)
      return parsedCandidate(store, candidateId).map((file) => ({
        reviewId: problem.id,
        candidateId,
        candidateLabel: candidate.label,
        path: file.path,
        oldPath: file.oldPath,
        isNew: file.isNew,
        isDeleted: file.isDeleted,
        isRenamed: file.isRenamed,
        isBinary: file.isBinary,
        ...countLineChanges(file.hunks),
        hunkCount: file.hunks.length,
      }))
    }),
    tool('get_file_diff', 'Read file diff', 'Read the hunks and changed lines for one file in a candidate diff.', schema({ candidateId: { type: 'string' }, file: { type: 'string' } }, ['candidateId', 'file']), readAnnotations, (input) => {
      const candidateId = requiredString(input, 'candidateId')
      const path = requiredString(input, 'file')
      const file = parsedCandidate(store, candidateId).find((item) => item.path === path)
      if (!file) throw new Error(`File not found in candidate diff: ${path}`)
      return {
        path: file.path,
        oldPath: file.oldPath,
        hunks: file.hunks.map((hunk) => ({
          oldStart: hunk.oldStart,
          newStart: hunk.newStart,
          changes: hunk.changes,
        })),
      }
    }),
    tool('search_diffs', 'Search diffs', 'Search changed lines across reviews, optionally limited to one review.', schema({ query: { type: 'string', minLength: 1 }, reviewId: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 100 } }, ['query']), readAnnotations, (input) => {
      const query = requiredString(input, 'query').toLocaleLowerCase()
      const reviewId = optionalString(input, 'reviewId')
      const limit = input.limit === undefined ? 50 : positiveLine(input.limit, 'limit')
      if (limit > 100) throw new Error('limit cannot exceed 100.')
      const { problems } = store.getState()
      const matches: Array<Record<string, unknown>> = []
      for (const problem of problems) {
        if (reviewId && problem.id !== reviewId) continue
        for (const candidate of problem.candidates) {
          const parsed = parseDiff(candidate.rawDiff)
          if (!parsed.ok) continue
          for (const file of parsed.files) {
            for (const hunk of file.hunks) {
              for (const change of hunk.changes) {
                if (!change.content.toLocaleLowerCase().includes(query)) continue
                matches.push({
                  reviewId: problem.id,
                  reviewTitle: problem.title,
                  candidateId: candidate.id,
                  candidateLabel: candidate.label,
                  file: file.path,
                  side: change.type === 'delete' ? 'old' : 'new',
                  lineNumber: change.type === 'normal' ? change.newLineNumber : change.lineNumber,
                  changeType: change.type,
                  content: change.content,
                })
                if (matches.length >= limit) return matches
              }
            }
          }
        }
      }
      return matches
    }),
    tool('list_comments', 'List comments', 'List review comments, with optional review, candidate, file, and status filters.', schema({ reviewId: { type: 'string' }, candidateId: { type: 'string' }, file: { type: 'string' }, status: { enum: ['approved', 'denied'] } }), readAnnotations, (input) => {
      const reviewId = optionalString(input, 'reviewId')
      const candidateId = optionalString(input, 'candidateId')
      const file = optionalString(input, 'file')
      const status = input.status
      if (status !== undefined && status !== 'approved' && status !== 'denied') throw new Error('status must be approved or denied.')
      const { problems, comments } = store.getState()
      const candidateToReview = new Map(problems.flatMap((problem) => problem.candidates.map((candidate) => [candidate.id, problem.id] as const)))
      return comments.filter((comment) =>
        (!reviewId || candidateToReview.get(comment.candidateId) === reviewId) &&
        (!candidateId || comment.candidateId === candidateId) &&
        (!file || comment.file === file) &&
        (status === undefined || (comment.status ?? 'approved') === status),
      )
    }),
    tool('add_comment', 'Add review comment', 'Add a whole-file, single-line, or multiline range comment to a changed file.', schema({
      candidateId: { type: 'string' },
      file: { type: 'string' },
      side: { enum: ['old', 'new'] },
      lineNumber: { type: 'integer', minimum: 1 },
      end: { type: 'object', properties: { side: { enum: ['old', 'new'] }, lineNumber: { type: 'integer', minimum: 1 } }, required: ['side', 'lineNumber'], additionalProperties: false },
      tags: { type: 'array', items: { type: 'string' }, minItems: 1 },
      body: { type: 'string' },
    }, ['candidateId', 'file', 'tags', 'body']), writeAnnotations, (input) => {
      const candidateId = requiredString(input, 'candidateId')
      const filePath = requiredString(input, 'file')
      const tags = input.tags
      const body = input.body
      if (!Array.isArray(tags) || tags.some((tag) => typeof tag !== 'string')) throw new Error('tags must be an array of strings.')
      if (typeof body !== 'string') throw new Error('body must be a string.')
      const file = parsedCandidate(store, candidateId).find((item) => item.path === filePath)
      if (!file) throw new Error(`File not found in candidate diff: ${filePath}`)
      const sideValue = input.side
      const lineValue = input.lineNumber
      const endValue = input.end
      if (sideValue === undefined && lineValue === undefined && endValue === undefined) {
        return store.getState().addComment({ candidateId, file: filePath, tags, body })
      }
      if (sideValue !== 'old' && sideValue !== 'new') throw new Error('side must be old or new for a line comment.')
      const lineNumber = positiveLine(lineValue, 'lineNumber')
      const start: Pos = { side: sideValue as Side, lineNumber }
      let snippet: string
      let end: Pos | undefined
      if (endValue !== undefined) {
        if (!endValue || typeof endValue !== 'object' || Array.isArray(endValue)) throw new Error('end must contain a side and lineNumber.')
        const rangeEnd = endValue as Record<string, unknown>
        if (rangeEnd.side !== 'old' && rangeEnd.side !== 'new') throw new Error('end.side must be old or new.')
        end = { side: rangeEnd.side as Side, lineNumber: positiveLine(rangeEnd.lineNumber, 'end.lineNumber') }
        snippet = makeRangeSnippet(file.hunks, start, end)
      } else {
        snippet = makeSnippet(file.hunks, start.side, start.lineNumber)
      }
      if (!snippet) throw new Error('The comment anchor must be within one diff hunk.')
      return store.getState().addComment({ candidateId, file: filePath, ...start, ...(end && { end }), snippet, tags, body })
    }),
    tool('set_comment_status', 'Set comment status', 'Set an existing comment to approved or denied.', schema({ commentId: { type: 'string' }, status: { enum: ['approved', 'denied'] } }, ['commentId', 'status']), writeAnnotations, (input) => {
      const commentId = requiredString(input, 'commentId')
      const status = input.status
      if (status !== 'approved' && status !== 'denied') throw new Error('status must be approved or denied.')
      if (!store.getState().comments.some((comment) => comment.id === commentId)) throw new Error(`Comment not found: ${commentId}`)
      store.getState().setCommentStatus(commentId, status)
      return { commentId, status }
    }),
  ]
}

export async function registerReviewTools(modelContext: ModelContext, store: ReviewStore, signal: AbortSignal): Promise<void> {
  for (const reviewTool of createReviewTools(store)) {
    await modelContext.registerTool(reviewTool, { signal })
  }
}
