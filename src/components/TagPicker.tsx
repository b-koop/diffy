import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { categories, isBuiltIn, resolveTag, tagLabel } from '../lib/categories'
import { canCreateTag, findSimilarTag, moveHighlight, suggestTags } from '../lib/suggest'
import { useStore } from '../store'

interface Props {
  value: string[]
  onChange(tags: string[]): void
}

const has = (list: string[], t: string) => list.some((x) => x.toLowerCase() === t.toLowerCase())

export function TagPicker({ value, onChange }: Props) {
  const customTags = useStore((s) => s.customTags)
  const removeCustomTag = useStore((s) => s.removeCustomTag)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [focus, setFocus] = useState<string>()

  const [active, setActive] = useState(0)
  const [navigated, setNavigated] = useState(false)
  const [settled, setSettled] = useState('')

  useEffect(() => {
    const id = setTimeout(() => setSettled(query), 150)
    return () => clearTimeout(id)
  }, [query])

  const root = useRef<HTMLDivElement>(null)
  const pressed = useRef(false)
  useEffect(() => {
    if (!open) return
    // A press elsewhere blurs the input; closing then would shift layout under the pointer and lose the click, so close on the click itself.
    const down = (e: PointerEvent) => (pressed.current = !root.current?.contains(e.target as Node))
    const click = (e: MouseEvent) => {
      pressed.current = false
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', down, true)
    const key = () => (pressed.current = false)
    window.addEventListener('click', click, true)
    window.addEventListener('keydown', key, true)
    return () => {
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('click', click, true)
      window.removeEventListener('keydown', key, true)
    }
  }, [open])

  const options = suggestTags(query, customTags)
  const canCreate = canCreateTag(query, customTags)
  const similar = settled === query ? findSimilarTag(query, customTags, value) : null
  const hint = similar && !options.some((o) => o.tag === similar.tag) ? similar : null
  const hintRow = hint ? options.length : -1
  const createRow = options.length + (hint ? 1 : 0)
  const rowCount = createRow + (canCreate ? 1 : 0)
  // Until the user arrows, Enter keeps its old meaning: first suggestion, else create.
  const highlight = navigated ? Math.min(active, rowCount - 1) : options.length ? 0 : createRow

  const toggle = (tag: string) => {
    const t = resolveTag(tag)
    onChange(has(value, t) ? value.filter((x) => x.toLowerCase() !== t.toLowerCase()) : [...value, t])
    setQuery('')
    setActive(0)
    setNavigated(false)
    setOpen(false)
  }
  const helpTag = focus ?? [...value].reverse().find(isBuiltIn)
  const help = categories.find((c) => c.slug === helpTag)

  return (
    <div
      className="tagpicker"
      ref={root}
      onBlur={(e) => !pressed.current && !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}
    >
      <div className="chips">
        {value.map((t) => (
          <span className="chip" key={t}>
            {tagLabel(t)}
            <button type="button" aria-label={`Remove ${tagLabel(t)}`} onClick={() => toggle(t)}>
              <X size={14} aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          role="combobox"
          aria-expanded={open}
          aria-label="Tags"
          placeholder={value.length ? '' : 'Pick or create tags'}
          value={query}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
            setNavigated(false)
            setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !query && value.length) onChange(value.slice(0, -1))
            if (e.key === 'Escape') setOpen(false)
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              setOpen(true)
              setNavigated(true)
              setActive(!navigated && hint && !options.length ? hintRow : moveHighlight(highlight, e.key === 'ArrowDown' ? 1 : -1, rowCount))
            }
            if (e.key === 'Enter' && query) {
              e.preventDefault()
              toggle(highlight < options.length ? options[highlight].tag : hint && highlight === hintRow ? hint.tag : query)
            }
          }}
        />
      </div>
      {open && (
        <ul className="options" role="listbox" aria-multiselectable onMouseDown={(e) => e.preventDefault()}>
          {options.map((o, i) => (
            <li
              key={o.tag}
              role="option"
              aria-selected={has(value, o.tag)}
              className={i === highlight ? 'active' : undefined}
              onMouseEnter={() => {
                setActive(i)
                setFocus(o.custom ? undefined : o.tag)
              }}
              onMouseLeave={() => setFocus(undefined)}
            >
              <button type="button" onClick={() => toggle(o.tag)}>
                <span className="check">{has(value, o.tag) ? '✓' : ''}</span>
                {o.label}
              </button>
              {o.custom && (
                <button type="button" className="link" onClick={() => removeCustomTag(o.tag)}>
                  remove tag
                </button>
              )}
            </li>
          ))}
          {hint && (
            <li role="option" aria-selected={false} className={highlight === hintRow ? 'dym active' : 'dym'}>
              <span>Did you mean {hint.label}?</span>
              <button type="button" onClick={() => toggle(hint.tag)}>
                Use {hint.label}
              </button>
            </li>
          )}
          {canCreate && (
            <li role="option" aria-selected={false} className={highlight === createRow ? 'active' : undefined}>
              <button type="button" onClick={() => toggle(query)}>
                Create tag "{query.trim()}"
              </button>
            </li>
          )}
        </ul>
      )}
      {help && <p className="help">{help.description}</p>}
    </div>
  )
}
