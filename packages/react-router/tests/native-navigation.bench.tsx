import { expect, test } from 'vitest'
import { createRootRoute, createRoute } from '../src/route'
import { createRouter } from '../src/router.native'
import { getNativeNavigation } from '../src/native/controller'

for (const count of [100, 1000]) {
  test(`native execution scope preparation with ${count} routes`, async ({
    bench,
  }) => {
    const root = createRootRoute()
    root.addChildren(
      Array.from({ length: count }, (_, index) =>
        createRoute({
          getParentRoute: () => root,
          path: `/item-${index}`,
          loader: () => index,
        }),
      ),
    )
    const router = createRouter({
      routeTree: root,
      native: {
        initialContainer: 'main',
        containers: { main: { initialHref: '/item-0' } },
      },
    })
    const navigation = getNativeNavigation(router)
    await navigation.initialize()
    const tick = async () => {
      await navigation.navigate({ href: '/item-99' })
      await navigation.back()
    }
    await tick()
    expect(navigation.getSnapshot().stacks.main).toHaveLength(1)
    expect(
      navigation.getActiveEntry()?.value.state.matches.at(-1)?.loaderData,
    ).toBe(0)
    const result = await bench(
      'new Router + load + native push/back',
      tick,
    ).run({
      time: 1000,
      warmupIterations: 10,
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

    expect(navigation.getSnapshot().stacks.main).toHaveLength(1)
    navigation.dispose()
  })
}
