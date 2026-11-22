import path from 'node:path'
import chokidar from 'chokidar'
import { Generator } from '@tanstack/router-generator'
import { getConfig } from './core/config'
import type { GeneratorEvent } from '@tanstack/router-generator'
import type { Config } from './core/config'

export interface WithTanStackRouterOptions {
  root?: string
  config?: Partial<Config> | (() => Partial<Config>)
  /** Watch while a Metro server is running. Build-only config loads never watch. */
  watch?: boolean
  /** Generate before Metro constructs its file map. Defaults to true. */
  initialGenerate?: boolean
}

type Middleware = (...args: Array<any>) => any
interface MetroServer {
  end: () => Promise<void>
}
interface MetroConfig {
  watchFolders?: Array<string>
  server?: {
    enhanceMiddleware?: (
      middleware: Middleware,
      server: MetroServer,
    ) => Middleware
  }
}

/**
 * Generate with the same config on startup and edits, before bundling. Return
 * this promise from metro.config.js; Metro and Expo await async config exports.
 * Watching belongs to the dev server, not transformer workers or export jobs.
 */
export async function withTanStackRouter<T extends object>(
  config: T,
  options: WithTanStackRouterOptions = {},
): Promise<T> {
  const root = path.resolve(options.root ?? process.cwd())
  const inline =
    typeof options.config === 'function' ? options.config() : options.config
  const userConfig = getConfig(inline ?? {}, root)
  const generator = new Generator({ root, config: userConfig })
  if (options.initialGenerate !== false) {
    await generator.run()
  }
  const metroConfig = config as T & MetroConfig
  if (!(options.watch ?? process.env.NODE_ENV !== 'production')) {
    return config
  }
  const enhance = metroConfig.server?.enhanceMiddleware
  return {
    ...config,
    watchFolders: Array.from(
      new Set([...(metroConfig.watchFolders ?? []), root]),
    ),
    server: {
      ...metroConfig.server,
      enhanceMiddleware(middleware: Middleware, server: MetroServer) {
        const original = enhance ? enhance(middleware, server) : middleware
        const watcher = chokidar.watch(userConfig.routesDirectory, {
          ignoreInitial: true,
        })
        let closed = false
        let ready!: () => void
        let failReady!: (error: unknown) => void
        let watchError: unknown
        const generate = (event?: GeneratorEvent) => {
          if (closed || watchError) {
            return
          }
          // Use the generator's own queue directly once the watcher is ready.
          pending = generator.run(event)
          void pending.catch((error: unknown) =>
            console.error('[TanStack Router/Metro]', error),
          )
        }
        let pending = new Promise<void>((resolve, reject) => {
          ready = resolve
          failReady = reject
          watcher.once('ready', () => {
            if (closed) {
              resolve()
              return
            }
            for (const [event, type] of [
              ['add', 'create'],
              ['change', 'update'],
              ['unlink', 'delete'],
            ] as const) {
              watcher.on(event, (file) => {
                if (/\.[cm]?[jt]sx?$/.test(file)) {
                  generate({ type, path: path.normalize(file) })
                }
              })
            }
            watcher.on('unlinkDir', () => generate())
            // A full scan covers edits made before the watcher was ready.
            generate()
            void pending.then(resolve, reject)
          })
        })
        watcher.on('error', (error: unknown) => {
          watchError = error
          failReady(error)
          console.error('[TanStack Router/Metro]', error)
        })
        const end = server.end
        server.end = async () => {
          closed = true
          ready()
          try {
            await watcher.close()
            await pending.catch(() => undefined)
          } finally {
            await end.call(server)
          }
        }
        return async (...args: Array<any>) => {
          try {
            await pending
            if (watchError) {
              throw watchError
            }
            return await original(...args)
          } catch (error) {
            return args[2](error)
          }
        }
      },
    },
  }
}

export default withTanStackRouter
