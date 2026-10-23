import { describe, expect, it } from 'vitest'
import { parseDiff } from './parseDiff'

const modify = `diff --git a/a.txt b/a.txt
index 111..222 100644
--- a/a.txt
+++ b/a.txt
@@ -1,3 +1,3 @@
 one
-two
+TWO
 three
@@ -20,2 +20,3 @@
 x
+y
 z
`
const rename = `diff --git a/old.txt b/new.txt
similarity index 100%
rename from old.txt
rename to new.txt
`
const added = `diff --git a/n.txt b/n.txt
new file mode 100644
index 0000000..333
--- /dev/null
+++ b/n.txt
@@ -0,0 +1 @@
+hi
`
const deleted = `diff --git a/gone.txt b/gone.txt
deleted file mode 100644
index 444..0000000
--- a/gone.txt
+++ /dev/null
@@ -1 +0,0 @@
-bye
`
const binary = `diff --git a/img.png b/img.png
index 1..2 100644
Binary files a/img.png and b/img.png differ
`

function files(input: string) {
  const r = parseDiff(input)
  if (!r.ok) throw new Error(r.error)
  return r.files
}

describe('parseDiff', () => {
  it('parses multiple hunks in one file', () => {
    const [f] = files(modify)
    expect(f.path).toBe('a.txt')
    expect(f.hunks).toHaveLength(2)
    expect([f.isNew, f.isDeleted, f.isRenamed, f.isBinary]).toEqual([false, false, false, false])
  })

  it('flags new files', () => {
    const [f] = files(added)
    expect(f.isNew).toBe(true)
    expect(f.path).toBe('n.txt')
  })

  it('flags deleted files and uses the old path', () => {
    const [f] = files(deleted)
    expect(f.isDeleted).toBe(true)
    expect(f.path).toBe('gone.txt')
  })

  it('flags renames', () => {
    const [f] = files(rename)
    expect(f.isRenamed).toBe(true)
    expect(f.oldPath).toBe('old.txt')
    expect(f.path).toBe('new.txt')
  })

  it('flags binary files only for the binary entry', () => {
    const fs = files(modify + binary)
    expect(fs.map((f) => f.isBinary)).toEqual([false, true])
  })

  it('returns an error result for empty or invalid input', () => {
    expect(parseDiff('')).toMatchObject({ ok: false })
    expect(parseDiff('   \n')).toMatchObject({ ok: false })
    expect(parseDiff('this is not a diff')).toMatchObject({ ok: false })
  })
})
