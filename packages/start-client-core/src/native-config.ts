import type { AnyStartInstanceOptions } from './createStart'
import type { CustomFetch } from './createServerFn'

export interface NativeStartOptions {
  origin: string
  serverFnBase?: string
  fetch?: CustomFetch
  startOptions?: Omit<AnyStartInstanceOptions, '~types'>
}
let nativeOptions: NativeStartOptions | undefined

export function configureNativeStart(options: NativeStartOptions) {
  const url = new URL(options.origin)
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error('Native Start requires an HTTP(S) backend origin')
  }
  nativeOptions = { ...options, origin: options.origin.replace(/\/$/, '') }
  const globals = globalThis as unknown as {
    __TSS_START_OPTIONS__?: NativeStartOptions['startOptions']
  }
  globals.__TSS_START_OPTIONS__ = {
    ...options.startOptions,
    serverFns: {
      ...options.startOptions?.serverFns,
      fetch: options.fetch ?? options.startOptions?.serverFns?.fetch,
    },
  }
}

export function getNativeStartOptions() {
  if (!nativeOptions) {
    throw new Error(
      'Call configureNativeStart before invoking native server functions',
    )
  }
  return nativeOptions
}
