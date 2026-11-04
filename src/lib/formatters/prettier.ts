import * as prettier from 'prettier/standalone'
import type { Plugin } from 'prettier'

// Parser plugins are separate chunks so loading one language does not fetch every Prettier parser.
const parserOptions = (filePath: string): { parser: string; plugins: Promise<Plugin[]> } | undefined => {
  const extension = filePath.split('.').pop()?.toLowerCase()
  switch (extension) {
    case 'js': case 'mjs': case 'cjs': case 'jsx': case 'mjx':
      return { parser: 'babel', plugins: Promise.all([import('prettier/plugins/babel'), import('prettier/plugins/estree')]) }
    case 'ts': case 'tsx':
      return { parser: 'typescript', plugins: Promise.all([import('prettier/plugins/typescript'), import('prettier/plugins/estree')]) }
    case 'json':
      return { parser: 'json', plugins: Promise.all([import('prettier/plugins/babel'), import('prettier/plugins/estree')]) }
    case 'css':
      return { parser: 'css', plugins: Promise.all([import('prettier/plugins/postcss')]) }
    case 'html': case 'xml': case 'svg':
      return { parser: 'html', plugins: Promise.all([import('prettier/plugins/html')]) }
    case 'yaml': case 'yml':
      return { parser: 'yaml', plugins: Promise.all([import('prettier/plugins/yaml')]) }
    default:
      return undefined
  }
}

export async function formatSource(source: string, filePath: string): Promise<string> {
  const options = parserOptions(filePath)
  if (!options) throw new Error(`Prettier does not support ${filePath}`)
  return prettier.format(source, {
    filepath: filePath,
    parser: options.parser,
    plugins: await options.plugins,
    tabWidth: 2,
    useTabs: false,
  })
}
