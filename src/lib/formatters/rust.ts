import rustWasmUrl from '@scalar/rust-fmt/wasm?url'
import { initializeBrowserScalarWasm, type ScalarWasmInitOptions } from './scalarWasm'
import { format, init } from '@scalar/rust-fmt'

let initialized: Promise<void> | undefined

// The browser export accepts init options; the package's shared Node declaration omits them.
const initBrowser = init as unknown as (options: ScalarWasmInitOptions) => Promise<void>

export async function formatSource(source: string, _filePath: string): Promise<string> {
  initialized ??= initializeBrowserScalarWasm(rustWasmUrl, initBrowser)
  await initialized
  return format(source, { edition: '2021' })
}
