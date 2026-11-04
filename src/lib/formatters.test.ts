import { describe, expect, it } from 'vitest'
import { formatSource, formatterForPath } from './formatters'

describe('path-selected formatters', () => {
  it.each([
    ['Demo.JS', 'prettier'],
    ['Demo.mjs', 'prettier'],
    ['Demo.cjs', 'prettier'],
    ['Demo.jsx', 'prettier'],
    ['Demo.mjx', 'prettier'],
    ['Demo.ts', 'prettier'],
    ['Demo.tsx', 'prettier'],
    ['Demo.json', 'prettier'],
    ['Demo.html', 'prettier'],
    ['Demo.xml', 'prettier'],
    ['Demo.svg', 'prettier'],
    ['Demo.css', 'prettier'],
    ['Demo.yaml', 'prettier'],
    ['Demo.yml', 'prettier'],
    ['Demo.c', 'clang-format'],
    ['Demo.h', 'clang-format'],
    ['Demo.cpp', 'clang-format'],
    ['Demo.cc', 'clang-format'],
    ['Demo.cxx', 'clang-format'],
    ['Demo.hpp', 'clang-format'],
    ['Demo.hh', 'clang-format'],
    ['Demo.hxx', 'clang-format'],
    ['Demo.java', 'clang-format'],
    ['script.sh', 'shfmt'],
    ['script.bash', 'shfmt'],
    ['main.go', 'gofmt'],
    ['main.py', 'ruff'],
    ['main.swift', 'swift-format'],
    ['main.rs', 'rustfmt'],
    ['query.sql', 'sql-formatter'],
    ['query.cql', 'sql-formatter'],
  ])('selects %s → %s', (path, formatter) => {
    expect(formatterForPath(path)?.id).toBe(formatter)
  })

  it.each(['main.cob', 'main.cbl', 'notes.txt'])('does not claim an unavailable formatter for %s', (path) => {
    expect(formatterForPath(path)).toBeUndefined()
  })

  it('formats source with the formatter selected by its path', async () => {
    await expect(formatSource('src/main.ts', 'const value:number=1')).resolves.toContain('const value: number = 1;')
    await expect(formatSource('config.json', '{"answer":42}')).resolves.toContain('"answer": 42')
    await expect(formatSource('query.sql', 'select id,name from users where active=true')).resolves.toContain('select\n')
    const formattedCql = await formatSource('schema.cql', 'create table ks.users(id uuid,name text,primary key(id)) with clustering order by(id desc);')
    expect(formattedCql).toContain('clustering')
    expect(formattedCql).toContain('order by')
    expect(formattedCql).toContain('primary key')
    await expect(formatSource('Component.mjx', 'const node=<div/>')).resolves.toContain('<div />')
    await expect(formatSource('config.yml', 'answer: 42\nlabel: hello')).resolves.toContain('label: hello')
    await expect(formatSource('styles.css', '.a{color:red}')).resolves.toContain('color: red')
    await expect(formatSource('markup.xml', '<root><item/></root>')).resolves.toContain('<item />')
    await expect(formatSource('Main.swift', 'struct Demo{let value:Int}')).resolves.toContain('let value: Int')
    await expect(formatSource('main.rs', 'pub fn add(a:i32,b:i32)->i32{a+b}')).resolves.toContain('a: i32')
  })

  it('shares lazy formatter loads by formatter id', () => {
    const first = formatterForPath('src/a.ts')?.load()
    const second = formatterForPath('src/b.jsx')?.load()
    expect(first).toBeDefined()
    expect(second).toBe(first)
  })

  it('returns undefined when no formatter supports the file path', async () => {
    await expect(formatSource('file.cob', '       DISPLAY "HI".')).resolves.toBeUndefined()
  })
})
