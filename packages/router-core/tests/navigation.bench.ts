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
      await navigation.select('main')
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

for (const count of [10, 100, 1000]) {
  test(`native blocker queries across ${count} retained visits`, async ({
    bench,
  }) => {
    const navigation = createNavigation<string>({
      initialContainer: 'main',
      containers: { main: { initialHref: '/' } },
      prepare: async (entry) => ({ value: entry.href }),
    })
    await navigation.reset(
      'main',
      Array.from({ length: count }, (_, i) => `/item/${i}`),
    )
    const entries = navigation.getSnapshot().stacks.main!
    for (const blocked of [false, true]) {
      const unblock = blocked
        ? navigation.block(entries[0]!.key, () => true)
        : undefined
      const query = () => {
        let found = 0
        for (const entry of entries) {
          if (navigation.isRemovalBlocked(entry.key)) {
            found++
          }
        }
        return found
      }
      expect(query()).toBe(blocked ? 1 : 0)
      const result = await bench(`blocker-${count}-${blocked}`, query).run({
        time: 600,
        warmupIterations: 20,
      })
      console.log(
        JSON.stringify({
          name: result.name,
          meanMs: result.latency.mean,
          p99Ms: result.latency.p99,
          rme: result.latency.rme,
          samples: result.latency.samplesCount,
        }),
      )
      unblock?.()
    }
    navigation.dispose()
  })
}

for (const depth of [1, 5, 15]) {
  test(`nested snapshot serialization at depth ${depth}`, async ({
    bench,
    skip,
  }) => {
    const navigation = createNavigation<string>({
      initialContainer: 'main',
      containers: { main: { initialHref: '/' } },
      prepare: async (entry) => ({ value: entry.href }),
      getNavigator: (entry) => {
        const level = Number(entry.href.split('/').at(-1))
        return entry.href.startsWith('/level/') && level < depth
          ? {
              initialContainer: 'child',
              containers: { child: { initialHref: `/level/${level + 1}` } },
            }
          : undefined
      },
    })
    if (!('getOwner' in navigation)) {
      skip()
      return
    }
    await navigation.initialize()
    await navigation.navigate({ href: '/level/0' })
    const serialized = navigation.serialize()
    expect(navigation.getEntries()).toHaveLength(depth + 2)
    const result = await bench(`serialize-depth-${depth}`, () =>
      navigation.serialize(),
    ).run({ time: 600, warmupIterations: 20 })
    console.log(
      JSON.stringify({
        name: result.name,
        bytes: serialized.length,
        meanMs: result.latency.mean,
        p99Ms: result.latency.p99,
        rme: result.latency.rme,
        samples: result.latency.samplesCount,
      }),
    )
    navigation.dispose()
  })
}

for (const count of [10, 100, 1000]) {
  test(`descendant blocker ownership across ${count} parent visits`, async ({
    bench,
    skip,
  }) => {
    const navigation = createNavigation<string>({
      initialContainer: 'main',
      containers: { main: { initialHref: '/' } },
      prepare: async (entry) => ({ value: entry.href }),
      getNavigator: (entry) =>
        entry.href.startsWith('/workspace/')
          ? {
              initialContainer: 'child',
              containers: {
                child: {
                  initialHref: `/child/${entry.href.split('/').at(-1)}`,
                },
              },
            }
          : undefined,
    })
    if (!('getOwner' in navigation)) {
      skip()
      return
    }
    await navigation.reset(
      'main',
      Array.from({ length: count }, (_, index) => `/workspace/${index}`),
    )
    const entries = navigation.getSnapshot().stacks.main!
    const unblocks = entries.map((entry) =>
      entry.navigator!.block(
        entry.navigator!.getActiveEntry()!.key,
        () => true,
      ),
    )
    const query = () => {
      let found = 0
      for (const entry of entries) {
        if (navigation.isRemovalBlocked(entry.key)) {
          found++
        }
      }
      return found
    }
    expect(query()).toBe(count)
    const result = await bench(`descendant-blockers-${count}`, query).run({
      time: 600,
      warmupIterations: 20,
    })
    console.log(
      JSON.stringify({
        name: result.name,
        meanMs: result.latency.mean,
        p99Ms: result.latency.p99,
        rme: result.latency.rme,
        samples: result.latency.samplesCount,
      }),
    )
    for (const unblock of unblocks) {
      unblock()
    }
    expect(query()).toBe(0)
    navigation.dispose()
  })
}
