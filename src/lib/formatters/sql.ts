import { format } from 'sql-formatter'

export async function formatSource(source: string, _filePath: string): Promise<string> {
  return format(source, { language: 'sql', tabWidth: 2 })
}
