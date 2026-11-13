import { TSS_SERVER_FUNCTION } from '../constants'
import { getNativeStartOptions } from '../native-config'
import { serverFnFetcher } from './serverFnFetcher'

export function createClientRpc(functionId: string) {
  const url = () => {
    const options = getNativeStartOptions()
    return `${options.origin}/${(options.serverFnBase ?? '_serverFn').replace(/^\/+|\/+$/g, '')}/${functionId}`
  }
  const clientFn = (...args: Array<any>) => {
    const options = getNativeStartOptions()
    const headers = new Headers(args[0]?.headers)
    // Native fetch has no browser to supply request provenance. Preserve an
    // explicit caller value; otherwise identify this configured backend origin.
    if (!headers.has('Origin')) {
      headers.set('Origin', new URL(options.origin).origin)
    }
    args[0] = { ...args[0], headers }
    return serverFnFetcher(
      url(),
      args,
      options.fetch ?? options.startOptions?.serverFns?.fetch ?? fetch,
    )
  }
  return Object.defineProperty(
    Object.assign(clientFn, {
      serverFnMeta: { id: functionId },
      [TSS_SERVER_FUNCTION]: true,
    }),
    'url',
    { get: url },
  )
}
