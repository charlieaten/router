import { afterEach, expect, test, vi } from 'vitest'
import { configureNativeStart } from '../src/native-config'
import { createClientRpc } from '../src/client-rpc/native'

// Metro compiles this isomorphic helper to its client branch on the device.
vi.mock('../src/getStartOptions', () => ({ getStartOptions: () => ({}) }))

afterEach(() => {
  vi.unstubAllGlobals()
})

test('native RPC uses the configured backend, preserves credentials/headers and supplies origin metadata', async () => {
  const transport = vi.fn(
    async () =>
      new Response(JSON.stringify({ value: 'native' }), {
        headers: { 'content-type': 'application/json' },
      }),
  )
  configureNativeStart({ origin: 'https://api.example.com', fetch: transport })
  const rpc = createClientRpc('function-id')
  const result = await rpc({
    method: 'POST',
    data: { id: '123' },
    headers: { Authorization: 'Bearer test-token' },
  })
  expect(result).toEqual({ value: 'native' })
  expect(transport).toHaveBeenCalledTimes(1)
  const [url, request] = transport.mock.calls[0] as unknown as [
    string,
    RequestInit,
  ]
  expect(url).toBe('https://api.example.com/_serverFn/function-id')
  expect(new Headers(request.headers).get('Origin')).toBe(
    'https://api.example.com',
  )
  expect(new Headers(request.headers).get('Authorization')).toBe(
    'Bearer test-token',
  )
  expect(request.method).toBe('POST')
})

test('native RPC forwards caller cancellation and does not overwrite explicit origin metadata', async () => {
  const abort = new AbortController()
  const transport = vi.fn(
    async () =>
      new Response('{}', { headers: { 'content-type': 'application/json' } }),
  )
  configureNativeStart({ origin: 'https://api.example.com' })
  await createClientRpc('fn')({
    method: 'GET',
    signal: abort.signal,
    headers: { Origin: 'https://custom.example.com' },
    fetch: transport,
  })
  const [, request] = transport.mock.calls[0] as unknown as [
    string,
    RequestInit,
  ]
  expect(request.signal).toBe(abort.signal)
  expect(new Headers(request.headers).get('Origin')).toBe(
    'https://custom.example.com',
  )
})
