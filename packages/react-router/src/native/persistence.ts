import type { NativeNavigation } from './controller'

export interface NativeNavigationStorage {
  getItem: (key: string) => Promise<string | null>
  setItem: (key: string, value: string) => Promise<unknown>
  removeItem?: (key: string) => Promise<unknown>
}
export interface NativeNavigationPersistenceOptions {
  key: string
  storage: NativeNavigationStorage
  version?: number
  debounceMs?: number
  migrate?: (
    version: number,
    snapshot: string,
  ) => string | undefined | Promise<string | undefined>
  onError?: (error: unknown) => void
}

/** One restore owner and one ordered writer; stale writes cannot win. */
export function createNavigationPersistence(
  navigation: NativeNavigation,
  options: NativeNavigationPersistenceOptions,
) {
  const initialize = navigation.initialize
  let restored: Promise<boolean> | undefined
  let ready = false
  let closed = false
  let queued: string | undefined
  let writing: Promise<void> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const report = (error: unknown) => {
    if (options.onError) {
      options.onError(error)
    } else {
      console.error(error)
    }
  }
  const flush = (): Promise<void> => {
    clearTimeout(timer)
    if (writing) {
      return writing
    }
    const work = async () => {
      while (queued !== undefined && !closed) {
        const value = queued
        queued = undefined
        await options.storage.setItem(options.key, value)
      }
    }
    writing = work()
      .catch(report)
      .finally(() => {
        writing = undefined
        if (queued !== undefined && !closed) {
          void flush()
        }
      })
    return writing
  }
  const unsubscribe = navigation.onChange(() => {
    if (!ready || closed) {
      return
    }
    queued = JSON.stringify({
      version: options.version ?? 1,
      snapshot: navigation.serialize(),
    })
    clearTimeout(timer)
    timer = setTimeout(() => {
      void flush()
    }, options.debounceMs ?? 200)
  })
  return {
    initialize() {
      restored ??= (async () => {
        try {
          const serialized = await options.storage.getItem(options.key)
          if (closed) {
            return false
          }
          if (serialized) {
            const data = JSON.parse(serialized)
            if (
              typeof data.version !== 'number' ||
              typeof data.snapshot !== 'string'
            ) {
              throw new Error('Invalid persisted navigation state')
            }
            const snapshot =
              data.version === (options.version ?? 1)
                ? data.snapshot
                : await options.migrate?.(data.version, data.snapshot)
            if (snapshot && !closed) {
              await navigation.restore(snapshot)
            }
          }
        } catch (error) {
          report(error)
          try {
            await options.storage.removeItem?.(options.key)
          } catch (cleanupError) {
            report(cleanupError)
          }
        }
        if (closed) {
          return false
        }
        const initialized = await initialize()
        ready = true
        return initialized
      })()
      return restored
    },
    flush,
    async clear() {
      queued = undefined
      clearTimeout(timer)
      await writing
      await options.storage.removeItem?.(options.key)
    },
    dispose() {
      closed = true
      queued = undefined
      clearTimeout(timer)
      unsubscribe()
    },
  }
}
