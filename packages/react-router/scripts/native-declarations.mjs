import { readdir, readFile, writeFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../dist/native/esm/', import.meta.url))
const files = (await readdir(root, { recursive: true })).filter((file) =>
  file.endsWith('.d.ts'),
)
// Native source resolution chooses .native files before their web counterparts.
// Make that selection explicit in published declarations, so consumers need
// only the react-native export condition, not internal moduleSuffixes rules.
for (const file of files) {
  const filename = path.join(root, file)
  const code = await readFile(filename, 'utf8')
  const matches = Array.from(
    code.matchAll(/(from\s*|import\s*\()(['"])(\.[^'"]+)\2/g),
  )
  const replacements = new Map()
  for (const match of matches) {
    const specifier = match[3]
    const base = path.resolve(
      path.dirname(filename),
      specifier.replace(/\.(?:js|mjs|cjs)$/, ''),
    )
    const candidates = [
      `${base}.native.d.ts`,
      `${base}.d.ts`,
      path.join(base, 'index.native.d.ts'),
      path.join(base, 'index.d.ts'),
    ]
    let resolved
    for (const candidate of candidates) {
      if (
        await stat(candidate)
          .then((stat) => stat.isFile())
          .catch(() => false)
      ) {
        resolved = candidate
        break
      }
    }
    if (!resolved) {
      throw new Error(
        `Unresolved native declaration import ${specifier} in ${file}`,
      )
    }
    let relative = path
      .relative(path.dirname(filename), resolved)
      .replaceAll(path.sep, '/')
      .replace(/\.d\.ts$/, '.js')
    if (!relative.startsWith('.')) {
      relative = `./${relative}`
    }
    replacements.set(match[0], `${match[1]}${match[2]}${relative}${match[2]}`)
  }
  let result = code
  for (const [before, after] of replacements) {
    result = result.replaceAll(before, after)
  }
  await writeFile(filename, result)
}
