import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative, sep } from 'node:path'

const root = new URL('../src/', import.meta.url)
const allowed = `${join('theme', 'themes')}${sep}`
const violations = []

async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      await visit(path)
      continue
    }
    if (!['.vue', '.css'].includes(extname(path))) continue
    const name = relative(root.pathname, path)
    if (name.startsWith(allowed)) continue
    const source = await readFile(path, 'utf8')
    const checks = [
      [/(?:#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})\b)/gi, 'hard-coded color'],
      [/rgba?\s*\(/gi, 'hard-coded color'],
      [/cubic-bezier\s*\(/gi, 'hard-coded easing'],
      [/<(?:svg|path|circle|rect)\b/gi, 'raw SVG'],
    ]
    for (const [pattern, label] of checks) {
      if (pattern.test(source)) violations.push(`${name}: ${label}`)
    }
  }
}

await visit(root.pathname)
if (violations.length) {
  console.error(violations.join('\n'))
  process.exitCode = 1
} else {
  console.log('Theme contract passed')
}
