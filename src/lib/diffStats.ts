import type { Hunk } from './parseDiff.js'

export function countLineChanges(hunks: Hunk[]): { additions: number; deletions: number } {
  let additions = 0
  let deletions = 0
  for (const hunk of hunks) {
    for (const change of hunk.changes) {
      if (change.type === 'insert') additions++
      if (change.type === 'delete') deletions++
    }
  }
  return { additions, deletions }
}

export function summarizeDiffFiles(files: Array<{ hunks: Hunk[] }>): { filesChanged: number; additions: number; deletions: number } {
  const totals = files.reduce((summary, file) => {
    const counts = countLineChanges(file.hunks)
    return { additions: summary.additions + counts.additions, deletions: summary.deletions + counts.deletions }
  }, { additions: 0, deletions: 0 })
  return { filesChanged: files.length, ...totals }
}
