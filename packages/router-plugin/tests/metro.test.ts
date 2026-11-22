import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { withTanStackRouter } from '../src/metro'

const roots: Array<string> = []
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'metro-routes-'))
  roots.push(root)
  const routesDirectory = path.join(root, 'routes')
  await mkdir(routesDirectory)
  await writeFile(
    path.join(routesDirectory, '__root.tsx'),
    "import {createRootRoute} from '@tanstack/react-router'; export const Route=createRootRoute()",
  )
  const write = (name: string, options = '{}') =>
    writeFile(
      path.join(routesDirectory, `${name}.tsx`),
      `import {createFileRoute} from '@tanstack/react-router'; export const Route=createFileRoute('/${name}')(${options})`,
    )
  await write('shared')
  await write('browser', "{platform:'web'}")
  const config = {
    routesDirectory,
    generatedRouteTree: path.join(root, 'runtime.native.js'),
    disableTypes: true,
    routePlatform: 'native' as const,
    routeTypes: { generatedRouteTree: path.join(root, 'routes.gen.ts') },
  }
  const read = (file = 'runtime.native.js') =>
    readFile(path.join(root, file), 'utf8')
  return { root, routesDirectory, config, write, read }
}

it('awaits initial inline config generation and shares types without platform-only runtime imports', async () => {
  const f = await fixture()
  const config = { server: { port: 8081 }, resolver: { sourceExts: ['ts'] } }
  expect(
    await withTanStackRouter(config, {
      root: f.root,
      config: f.config,
      watch: false,
    }),
  ).toBe(config)
  expect(await f.read()).toContain('./routes/shared')
  expect(await f.read()).not.toContain('./routes/browser')
  expect(await f.read('routes.gen.ts')).toContain('./routes/browser')
  expect(await f.read('runtime.native.d.ts')).toContain("from './routes.gen'")
})

it('rejects initial generation errors instead of starting with a missing tree', async () => {
  const f = await fixture()
  await f.write('broken', "{platform:'ios'}")
  await expect(
    withTanStackRouter({}, { root: f.root, config: f.config, watch: false }),
  ).rejects.toThrow('Set platform once')
})

it('watches edits, additions, deletions and renames, composes middleware and closes with Metro', async () => {
  const f = await fixture()
  const middleware = vi.fn()
  const enhance = vi.fn(
    (_middleware: (...args: Array<any>) => any, _server: unknown) => middleware,
  )
  const originalEnd = vi.fn(async () => {})
  const server = { end: originalEnd }
  const config = await withTanStackRouter(
    { server: { enhanceMiddleware: enhance } },
    { root: f.root, config: f.config, watch: true },
  )
  const handler = config.server.enhanceMiddleware(middleware, server)
  try {
    await handler({}, {}, vi.fn())
    expect(enhance).toHaveBeenCalledWith(middleware, server)
    expect(middleware).toHaveBeenCalledOnce()
    await f.write('browser', "{platform:'native'}")
    await vi.waitFor(async () =>
      expect(await f.read()).toContain('./routes/browser'),
    )
    await Promise.all([f.write('first'), f.write('second')])
    await vi.waitFor(async () => {
      const source = await f.read()
      expect(source).toContain('./routes/first')
      expect(source).toContain('./routes/second')
    })
    await rename(
      path.join(f.routesDirectory, 'first.tsx'),
      path.join(f.routesDirectory, 'renamed.tsx'),
    )
    await rm(path.join(f.routesDirectory, 'second.tsx'))
    await vi.waitFor(async () => {
      const source = await f.read()
      expect(source).toContain('./routes/renamed')
      expect(source).not.toContain('./routes/first')
      expect(source).not.toContain('./routes/second')
    })
  } finally {
    await server.end()
  }
  expect(originalEnd).toHaveBeenCalledOnce()
  await f.write('afterClose')
  await new Promise((resolve) => setTimeout(resolve, 100))
  expect(await f.read()).not.toContain('./routes/afterClose')
})

it('can close immediately without waiting forever for watcher readiness', async () => {
  const f = await fixture()
  const server = { end: vi.fn(async () => {}) }
  const config = await withTanStackRouter(
    {
      server: {
        enhanceMiddleware: (
          middleware: (...args: Array<any>) => any,
          _server: unknown,
        ) => middleware,
      },
    },
    { root: f.root, config: f.config },
  )
  config.server.enhanceMiddleware(vi.fn(), server)
  await server.end()
})

it('forwards failures from the existing middleware to Connect', async () => {
  const f = await fixture()
  const original = vi.fn()
  const server = { end: vi.fn(async () => {}) }
  const config = await withTanStackRouter(
    {
      server: {
        enhanceMiddleware: (
          _middleware: (...args: Array<any>) => any,
          _server: unknown,
        ) => original,
      },
    },
    { root: f.root, config: f.config },
  )
  const handler = config.server.enhanceMiddleware(original, server)
  try {
    await handler({}, {}, vi.fn())
    for (const asynchronous of [false, true]) {
      const error = new Error('middleware failed'),
        next = vi.fn()
      original.mockImplementationOnce(() => {
        if (asynchronous) {
          return Promise.reject(error)
        }
        throw error
      })
      await expect(handler({}, {}, next)).resolves.toBeUndefined()
      expect(next).toHaveBeenCalledWith(error)
    }
  } finally {
    await server.end()
  }
})
