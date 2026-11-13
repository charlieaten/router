import { test } from 'vitest'
import { setup } from './setup'

test('client-nav', async ({ bench }) => {
  const scenario = setup()

  const result = await bench(
    'client-side navigation loop (react)',
    { beforeAll: scenario.before, afterAll: scenario.after },
    async () => {
      for (let i = 0; i < 10; i++) {
        await scenario.tick()
      }
    },
  ).run({
    warmupIterations: 100,
    time: 10_000,
  })
  console.log(
    JSON.stringify({
      name: result.name,
      meanMs: result.latency.mean,
      hz: result.throughput.mean,
      p99Ms: result.latency.p99,
      p999Ms: result.latency.p999,
      rme: result.latency.rme,
      samples: result.latency.samplesCount,
    }),
  )
})
