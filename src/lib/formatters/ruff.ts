import init, { format } from '@wasm-fmt/ruff_fmt/vite'

let initialized: Promise<unknown> | undefined

export async function formatSource(source: string, filePath: string): Promise<string> {
  initialized ??= init()
  await initialized
  return format(source, filePath)
}
