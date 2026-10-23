import gitDiffParser from 'gitdiff-parser'
import type { File as GitFile, Hunk } from 'gitdiff-parser'

export type { Hunk }

export interface DiffFile {
  /** Display path: old path for deletions, new path otherwise. */
  path: string
  oldPath: string
  newPath: string
  isNew: boolean
  isDeleted: boolean
  isRenamed: boolean
  isBinary: boolean
  hunks: Hunk[]
  /** Original parser output, for react-diff-view. */
  raw: GitFile
}

export type ParseResult = { ok: true; files: DiffFile[] } | { ok: false; error: string }

export function parseDiff(input: string): ParseResult {
  if (!input.trim()) return { ok: false, error: 'Diff is empty.' }
  let parsed: GitFile[]
  try {
    parsed = gitDiffParser.parse(input)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not parse diff.' }
  }
  if (parsed.length === 0) return { ok: false, error: 'No file changes found in diff.' }

  const sections = input.split(/^(?=diff --git )/m).filter((s) => s.startsWith('diff --git '))
  const aligned = sections.length === parsed.length
  const files = parsed.map((f, i): DiffFile => {
    const isDeleted = f.type === 'delete'
    return {
      path: isDeleted ? f.oldPath : f.newPath,
      oldPath: f.oldPath,
      newPath: f.newPath,
      isNew: f.type === 'add',
      isDeleted,
      isRenamed: f.type === 'rename',
      isBinary: aligned && /^(Binary files .* differ|GIT binary patch)$/m.test(sections[i]),
      hunks: f.hunks,
      raw: f,
    }
  })
  return { ok: true, files }
}
