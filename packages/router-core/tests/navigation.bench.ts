import { expect, test } from 'vitest'
import { createNavigation } from '../src/navigation'

for (const retained of [0, 100, 1000]) {
  test(`presentation push/back with ${retained} inactive visits`, async ({
    bench,
  }) => {
    let acquired = 0
    let disposed = 0
    const navigation = createNavigation<number>({
      initialContainer: 'main',
      containers: {
        main: { initialHref: '/' },
        other: { initialHref: '/other' },
      },
      prepare: async () => ({ value: ++acquired }),
      dispose: () => {
        disposed++
      },
    })
    await navigation.initialize()
    if (retained) {
      await navigation.reset(
        'other',
        Array.from({ length: retained }, (_, i) => `/item/${i}`),
      )
    }
    const original = navigation.getActiveEntry()
    const tick = async () => {
      await navigation.navigate({ href: '/next' })
      await navigation.back()
    }
    await tick()
    expect(navigation.getActiveEntry()).toBe(original)
    expect(acquired - disposed).toBe(retained + 1)
    const result = await bench('push/back', tick).run({
      time: 1000,
      warmupIterations: 20,
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

    expect(navigation.getActiveEntry()).toBe(original)
    navigation.dispose()
    expect(disposed).toBe(acquired)
  })
}
