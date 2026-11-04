import { formatSource as formatPrettier } from './formatters/prettier'
export interface SourceFormatter {
  id: 'prettier' | 'clang-format' | 'shfmt' | 'gofmt' | 'ruff' | 'rustfmt' | 'swift-format' | 'sql-formatter'
  format(source: string, filePath: string): Promise<string>
}

interface FormatterEntry {
  id: SourceFormatter['id']
  load(): Promise<SourceFormatter>
}

// Prettier is the shared baseline; its parser plugins and other formatter engines are split into on-demand chunks.
const prettier: FormatterEntry = {
  id: 'prettier',
  load: async () => ({ id: 'prettier', format: formatPrettier }),
}
const clang: FormatterEntry = {
  id: 'clang-format',
  load: async () => {
    const module = await import('./formatters/clang')
    return { id: 'clang-format', format: module.formatSource }
  },
}
const shfmt: FormatterEntry = {
  id: 'shfmt',
  load: async () => {
    const module = await import('./formatters/shfmt')
    return { id: 'shfmt', format: module.formatSource }
  },
}
const gofmt: FormatterEntry = {
  id: 'gofmt',
  load: async () => {
    const module = await import('./formatters/gofmt')
    return { id: 'gofmt', format: module.formatSource }
  },
}
const ruff: FormatterEntry = {
  id: 'ruff',
  load: async () => {
    const module = await import('./formatters/ruff')
    return { id: 'ruff', format: module.formatSource }
  },
}
const rust: FormatterEntry = {
  id: 'rustfmt',
  load: async () => {
    const module = await import('./formatters/rust')
    return { id: 'rustfmt', format: module.formatSource }
  },
}
const swift: FormatterEntry = {
  id: 'swift-format',
  load: async () => {
    const module = await import('./formatters/swift')
    return { id: 'swift-format', format: module.formatSource }
  },
}
const sql: FormatterEntry = {
  id: 'sql-formatter',
  load: async () => {
    const module = await import('./formatters/sql')
    return { id: 'sql-formatter', format: module.formatSource }
  },
}

const extensions: Record<string, FormatterEntry> = {
  js: prettier, mjs: prettier, cjs: prettier, jsx: prettier, mjx: prettier,
  ts: prettier, tsx: prettier,
  json: prettier,
  css: prettier,
  html: prettier, xml: prettier, svg: prettier,
  yaml: prettier, yml: prettier,
  c: clang, h: clang, cpp: clang, cc: clang, cxx: clang, hpp: clang, hh: clang, hxx: clang, java: clang,
  sh: shfmt, bash: shfmt,
  go: gofmt,
  py: ruff,
  rs: rust,
  swift,
  sql, cql: sql,
}

const loaded = new Map<SourceFormatter['id'], Promise<SourceFormatter>>()

function load(entry: FormatterEntry): Promise<SourceFormatter> {
  let formatter = loaded.get(entry.id)
  if (!formatter) {
    formatter = entry.load()
    loaded.set(entry.id, formatter)
    void formatter.catch(() => loaded.delete(entry.id))
  }
  return formatter
}

export function formatterForPath(filePath: string): { id: SourceFormatter['id']; load: () => Promise<SourceFormatter> } | undefined {
  const basename = filePath.split(/[\\/]/).pop() ?? ''
  const dot = basename.lastIndexOf('.')
  if (dot <= 0 || dot === basename.length - 1) return undefined
  const entry = extensions[basename.slice(dot + 1).toLowerCase()]
  return entry ? { id: entry.id, load: () => load(entry) } : undefined
}

export async function formatSource(filePath: string, source: string): Promise<string | undefined> {
  const formatter = formatterForPath(filePath)
  if (!formatter) return undefined
  return (await formatter.load()).format(source, filePath)
}

interface WorkerResponse {
  id: number
  formatted?: string
  error?: string
}

let formatterWorker: Worker | undefined
let nextRequestId = 0
const requests = new Map<number, { resolve(value: string | undefined): void; reject(error: Error): void }>()

function getFormatterWorker(): Worker {
  if (formatterWorker) return formatterWorker
  // Large WASM engines stay off the UI thread and are retained in this worker after first use.
  const worker = new Worker(new URL('./formatterWorker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
    const request = requests.get(data.id)
    if (!request) return
    requests.delete(data.id)
    if (data.error !== undefined) request.reject(new Error(data.error))
    else request.resolve(data.formatted)
  }
  worker.onerror = (event) => {
    const error = new Error(event.message || 'Formatter worker failed.')
    formatterWorker?.terminate()
    formatterWorker = undefined
    for (const request of requests.values()) request.reject(error)
    requests.clear()
  }
  formatterWorker = worker
  return worker
}

export function formatSourceInWorker(filePath: string, source: string): Promise<string | undefined> {
  if (typeof Worker === 'undefined') return formatSource(filePath, source)
  const id = ++nextRequestId
  return new Promise((resolve, reject) => {
    requests.set(id, { resolve, reject })
    try {
      getFormatterWorker().postMessage({ id, filePath, source })
    } catch (error) {
      requests.delete(id)
      reject(error instanceof Error ? error : new Error(String(error)))
    }
  })
}
