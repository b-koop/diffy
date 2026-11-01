import { findTextMatches } from './diffSearch'

const selectedHighlightName = 'diffy-selected-text'
const hoverHighlightName = 'diffy-hover-word'
const identifierPattern = /[\p{L}_$][\p{L}\p{N}_$]*/gu

type TextNodeEntry = { node: Text; start: number; end: number }

function cellForNode(node: Node | null, root: HTMLElement): HTMLElement | undefined {
  const element = node instanceof Element ? node : node?.parentElement
  const cell = element?.closest<HTMLElement>('td.diff-code')
  return cell && root.contains(cell) && !cell.classList.contains('empty') ? cell : undefined
}

function textEntries(cell: HTMLElement): { entries: TextNodeEntry[]; text: string } {
  const entries: TextNodeEntry[] = []
  const walker = cell.ownerDocument.createTreeWalker(cell, NodeFilter.SHOW_TEXT)
  let text = ''
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const value = node.textContent ?? ''
    entries.push({ node: node as Text, start: text.length, end: text.length + value.length })
    text += value
  }
  return { entries, text }
}

function offsetInCell(cell: HTMLElement, node: Node, offset: number): number | undefined {
  const { entries } = textEntries(cell)
  if (node.nodeType === Node.TEXT_NODE) {
    const entry = entries.find((item) => item.node === node)
    return entry && offset >= 0 && offset <= entry.end - entry.start ? entry.start + offset : undefined
  }
  if (node.nodeType === Node.ELEMENT_NODE && cell.contains(node)) {
    const range = cell.ownerDocument.createRange()
    try {
      range.setStart(cell, 0)
      range.setEnd(node, offset)
      return range.toString().length
    } catch {
      return undefined
    }
  }
  return undefined
}

function endpoint(cell: HTMLElement, offset: number): { node: Node; offset: number } | undefined {
  const { entries, text } = textEntries(cell)
  if (offset < 0 || offset > text.length) return undefined
  const entry = entries.find((item) => offset >= item.start && offset <= item.end)
  if (entry) return { node: entry.node, offset: offset - entry.start }
  if (!entries.length && offset === 0) return { node: cell, offset: 0 }
  return undefined
}

function rangeForText(cell: HTMLElement, start: number, end: number): Range | undefined {
  const from = endpoint(cell, start)
  const to = endpoint(cell, end)
  if (!from || !to) return undefined
  const range = cell.ownerDocument.createRange()
  range.setStart(from.node, from.offset)
  range.setEnd(to.node, to.offset)
  return range
}

export function readCodeSelection(selection: Selection | null, root: HTMLElement): string | undefined {
  if (!selection || selection.isCollapsed || !selection.anchorNode || !selection.focusNode) return undefined
  const anchorCell = cellForNode(selection.anchorNode, root)
  const focusCell = cellForNode(selection.focusNode, root)
  if (!anchorCell || !focusCell) return undefined
  const text = selection.toString().trim()
  return text || undefined
}

export function codePointAt(document: Document, x: number, y: number): { cell: HTMLElement; offset: number } | undefined {
  let node: Node | null = null
  let localOffset = -1
  const caretPosition = document.caretPositionFromPoint?.(x, y)
  if (caretPosition) {
    node = caretPosition.offsetNode
    localOffset = caretPosition.offset
  } else {
    const range = document.caretRangeFromPoint?.(x, y)
    if (range) {
      node = range.startContainer
      localOffset = range.startOffset
    }
  }
  if (!node) return undefined
  const cell = cellForNode(node, document.documentElement)
  if (!cell) return undefined
  const offset = offsetInCell(cell, node, localOffset)
  return offset === undefined ? undefined : { cell, offset }
}

export function selectCodeIdentifier(event: MouseEvent, root: HTMLElement): void {
  if (event.button !== 0 || !root.contains(event.target as Node)) return
  const document = root.ownerDocument
  const point = codePointAt(document, event.clientX, event.clientY)
  if (!point || !root.contains(point.cell)) return
  const text = point.cell.textContent ?? ''
  identifierPattern.lastIndex = 0
  for (const match of text.matchAll(identifierPattern)) {
    const start = match.index ?? 0
    const end = start + match[0].length
    if (point.offset < start || point.offset >= end) continue
    const range = rangeForText(point.cell, start, end)
    if (!range) return
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    event.preventDefault()
    return
  }
}

export function paintCodeHighlights(root: HTMLElement, selectedText?: string, hoveredWord?: string): void {
  const css = root.ownerDocument.defaultView?.CSS as (typeof CSS & { highlights?: Map<string, Highlight> }) | undefined
  const HighlightCtor = root.ownerDocument.defaultView?.Highlight
  if (!css?.highlights || !HighlightCtor) return
  const selectedRanges: Range[] = []
  const hoverRanges: Range[] = []
  const cells = [...root.querySelectorAll<HTMLElement>('td.diff-code:not(.empty)')]
  for (const cell of cells) {
    const { text } = textEntries(cell)
    if (selectedText) {
      for (const match of findTextMatches([{ lineNumber: 1, content: text }], selectedText)) {
        const range = rangeForText(cell, match.start, match.start + match.length)
        if (range) selectedRanges.push(range)
      }
    }
    if (hoveredWord) {
      identifierPattern.lastIndex = 0
      for (const match of text.matchAll(identifierPattern)) {
        if (match[0] !== hoveredWord) continue
        const start = match.index ?? 0
        const range = rangeForText(cell, start, start + match[0].length)
        if (range) hoverRanges.push(range)
      }
    }
  }
  css.highlights.delete(selectedHighlightName)
  css.highlights.delete(hoverHighlightName)
  if (selectedRanges.length) {
    const highlight = new HighlightCtor(...selectedRanges)
    highlight.priority = 2
    css.highlights.set(selectedHighlightName, highlight)
  }
  if (hoverRanges.length) {
    const highlight = new HighlightCtor(...hoverRanges)
    highlight.priority = 1
    css.highlights.set(hoverHighlightName, highlight)
  }
}

export function clearCodeHighlights(): void {
  const highlights = (globalThis.CSS as typeof CSS & { highlights?: Map<string, Highlight> } | undefined)?.highlights
  highlights?.delete(selectedHighlightName)
  highlights?.delete(hoverHighlightName)
}
