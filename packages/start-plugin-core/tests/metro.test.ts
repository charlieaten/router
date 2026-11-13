import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, vi } from 'vitest'
import {
  createNativeStartCompiler,
  createMetroTransformer,
  discoverNativeServerFunctions,
} from '../src/metro'

const root = fileURLToPath(
  new URL('./fixtures/metro/test-files/', import.meta.url),
)
const filename = path.join(root, 'src/functions.ts')
const code = `import { createServerFn } from '@tanstack/react-start'
import { readFile } from 'node:fs/promises'
export const loadSecret = createServerFn({method:'POST'}).validator((input:{id:string})=>input).handler(({data})=>readFile(data.id,'utf8'))`

test('Metro compiles the shared server function and excludes its server implementation', async () => {
  const compiler = createNativeStartCompiler({ root, mode: 'dev' })
  const result = await compiler.transform(code, filename)
  expect(result?.code).toContain('createClientRpc')
  expect(result?.code).not.toContain('node:fs')
  expect(result?.code).not.toContain('readFile')
  const encoded = result!.code.match(/createClientRpc\(["']([^"']+)/)![1]!
  const metadata = JSON.parse(Buffer.from(encoded, 'base64url').toString())
  expect(metadata.file).toContain('/src/functions.ts')
  expect(metadata.export).toContain('loadSecret')
})

test('production function identities are stable across repeated Metro transformations', async () => {
  const compiler = createNativeStartCompiler({ root, mode: 'build' })
  const first = await compiler.transform(code, filename)
  const second = await compiler.transform(code + '\n', filename)
  const id = (source: string) =>
    source.match(/createClientRpc\(["']([^"']+)/)![1]
  expect(id(first!.code)).toBe(id(second!.code))
  expect(id(first!.code)).toMatch(/^[a-f0-9]{64}$/)
})

test('Metro keeps ordinary Flow modules and assets on the existing transformer', async () => {
  const transform = vi.fn((input) => input)
  const metro = createMetroTransformer({ root, upstream: { transform } })
  const input = {
    src: 'import typeof Foo from "./Foo";',
    filename: '/node_modules/react-native/View.js',
    options: { dev: true, platform: 'ios' },
    plugins: ['existing'],
  }
  expect(await metro.transform(input)).toBe(input)
  expect(transform).toHaveBeenCalledWith(input)
})

test('Metro resolves project-relative filenames before generating server function identities', async () => {
  const transform = vi.fn((input) => input)
  const metro = createMetroTransformer({ root, upstream: { transform } })
  const result = (await metro.transform({
    src: code,
    filename: '../src/functions.ts',
    options: {
      dev: true,
      platform: 'ios',
      projectRoot: path.join(root, 'native'),
    },
  })) as { src: string }
  const encoded = result.src.match(/createClientRpc\(["']([^"']+)/)![1]!
  expect(JSON.parse(Buffer.from(encoded, 'base64url').toString()).file).toBe(
    '/src/functions.ts?tss-serverfn-split',
  )
})

test('discovery registers only functions reachable in the surviving client graph', async () => {
  const found = await discoverNativeServerFunctions({
    root,
    entries: ['src/native-entry.ts'],
  })
  expect(Object.values(found.functions).map((fn) => fn.functionName)).toEqual([
    'publicFn_createServerFn_handler',
  ])
  expect(found.files).toEqual([path.join(root, 'src/native-entry.ts')])
})

test('production discovery includes both iOS and Android JavaScript implementations', async () => {
  const found = await discoverNativeServerFunctions({
    root,
    entries: ['src/platform-entry.ts'],
  })
  expect(
    Object.values(found.functions)
      .map((fn) => fn.functionName)
      .sort(),
  ).toEqual([
    'androidFn_createServerFn_handler',
    'iosFn_createServerFn_handler',
  ])
})

test('Metro forwards cache context to the existing Babel transformer', () => {
  const getCacheKey = vi.fn(
    (options?: { revision: string }) => options?.revision ?? 'missing',
  )
  const metro = createMetroTransformer({
    root,
    upstream: { transform: (input) => input, getCacheKey },
  })
  const before = metro.getCacheKey({ revision: 'before' })
  const after = metro.getCacheKey({ revision: 'after' })
  expect(before).not.toBe(after)
  expect(getCacheKey).toHaveBeenLastCalledWith({ revision: 'after' })
})

test('native discovery registers matching development identities without exposing handler-only functions', async () => {
  const discovered = await discoverNativeServerFunctions({
    root,
    entries: ['src/native-entry.ts'],
    mode: 'dev',
  })
  const functions = Object.entries(discovered.functions)
  expect(functions.map(([, fn]) => fn.functionName)).toEqual([
    'publicFn_createServerFn_handler',
  ])
  const identity = JSON.parse(
    Buffer.from(functions[0]![0], 'base64url').toString('utf8'),
  )
  expect(identity.file).toBe('/src/native-entry.ts?tss-serverfn-split')
})
