import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { withTanStackRouter } from '../src/metro'

const state = vi.hoisted(() => ({ watcher: undefined as any, watch: vi.fn() }))
vi.mock('chokidar', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    default: {
      watch: state.watch.mockImplementation(() => {
        const watcher = new EventEmitter() as any
        watcher.close = vi.fn(async () => {})
        state.watcher = watcher
        return watcher
      }),
    },
  }
})
const roots: Array<string> = []
afterEach(async () => {
  vi.clearAllMocks()
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})
async function config(watch = true) {
  const root = await mkdtemp(path.join(tmpdir(), 'metro-lifecycle-'))
  roots.push(root)
  return withTanStackRouter(
    {
      server: {
        enhanceMiddleware: (
          middleware: (...args: Array<any>) => any,
          _server: unknown,
        ) => middleware,
      },
    },
    { root, watch, initialGenerate: false },
  )
}
it('surfaces watcher errors before readiness without retrying forever', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    const configured = await config()
    const originalEnd = vi.fn(async () => {})
    const server = { end: originalEnd }
    const handler = configured.server.enhanceMiddleware(vi.fn(), server)
    const next = vi.fn()
    const request = handler({}, {}, next)
    const error = new Error('watch failed')
    state.watcher.emit('error', error)
    await request
    expect(next).toHaveBeenCalledWith(error)
    await server.end()
    expect(originalEnd).toHaveBeenCalledOnce()
  } finally {
    log.mockRestore()
  }
})
it('always ends Metro when watcher cleanup fails', async () => {
  const configured = await config()
  const originalEnd = vi.fn(async () => {})
  const server = { end: originalEnd }
  configured.server.enhanceMiddleware(vi.fn(), server)
  state.watcher.close.mockRejectedValue(new Error('close failed'))
  await expect(server.end()).rejects.toThrow('close failed')
  expect(originalEnd).toHaveBeenCalledOnce()
})
it('does not create watchers during config loading or build-only use', async () => {
  await config()
  await config(false)
  expect(state.watch).not.toHaveBeenCalled()
})
