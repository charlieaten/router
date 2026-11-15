import { expect, test } from 'vitest'
import { createRootRoute, createRoute } from '../src/route'
import { createRouter } from '../src/router.native'
import { getNativeNavigation } from '../src/native/controller'

for (const count of [10, 100, 1000]) {
  test(`retained screen lookup with ${count} active visits`, async ({
    bench,
  }) => {
    const entries = Array.from({ length: count }, (_, index) => ({
      key: `entry-${index}`,
    }))
    const retained = [...entries, { key: 'outgoing' }]
    const findEach = () =>
      retained.map((entry) =>
        entries.findIndex((item) => item.key === entry.key),
      )
    const indexOnce = () => {
      const indexes = new Map(entries.map((entry, index) => [entry.key, index]))
      return retained.map((entry) => indexes.get(entry.key) ?? -1)
    }
    expect(indexOnce()).toEqual(findEach())
    for (const [name, run] of [
      ['find each', findEach],
      ['index once', indexOnce],
    ] as const) {
      const result = await bench(name, run).run({
        time: 500,
        warmupIterations: 20,
      })
      console.log(
        JSON.stringify({
          count,
          name,
          meanMs: result.latency.mean,
          p99Ms: result.latency.p99,
          rme: result.latency.rme,
          samples: result.latency.samplesCount,
        }),
      )
    }
  })
}

for (const count of [100, 1000, 10000]) {
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

for (const count of [6, 50, 500]) {
  test(`standard descriptor projection with ${count} routes`, async ({
    bench,
  }) => {
    const source = '../src/native/standard-navigation'
    const { createStandardNavigationArgs } = await import(
      /* @vite-ignore */ source
    )
    const root = createRootRoute()
    const home = createRoute({ getParentRoute: () => root, path: '/' })
    const router = createRouter({ routeTree: root.addChildren([home]) })
    const navigation = getNativeNavigation(router)
    await navigation.initialize()
    const context = {
      id: '$root',
      kind: 'tabs' as const,
      selected: 'tab-0',
      navigation,
      routes: Array.from({ length: count }, (_, index) => ({
        key: `tab-${index}`,
        name: `tab-${index}`,
        href: '/',
      })),
      children: Array.from({ length: count }, (_, index) => ({
        key: `tab-${index}`,
        title: `Tab ${index}`,
        content: null,
      })),
      onNavigate: () => {},
      onSelect: () => {},
      onBack: () => {},
      open: false,
      onOpenChange: () => {},
    }
    const options = {
      screenOptions: ({ item }: { item: { title: string } }) => ({
        title: item.title,
      }),
    }
    const run = () => createStandardNavigationArgs(context, options)
    expect(Object.keys(run().descriptors)).toHaveLength(count)
    expect(run().state.index).toBe(0)
    const result = await bench('standard descriptor projection', run).run({
      time: 1000,
      warmupIterations: 20,
    })
    console.log(
      JSON.stringify({
        count,
        meanMs: result.latency.mean,
        p99Ms: result.latency.p99,
        rme: result.latency.rme,
        samples: result.latency.samplesCount,
      }),
    )
    router.history.destroy()
  })
}

for (const count of [10, 100]) {
  for (const sheets of [false, true]) {
    test(`custom stack rendering with ${count} ${sheets ? 'mixed page/sheet' : 'page'} visits`, async ({
      bench,
    }) => {
      const React = await import('react')
      const { act, render } = await import('@testing-library/react')
      const native = await import('../dist/native/esm/index.native.js')
      const controller = await import('../dist/native/esm/native/controller.js')
      const root = native.createRootRoute({ component: native.Outlet })
      const page = native.createRoute({
        getParentRoute: () => root,
        path: '/page/$id',
        component: () => React.createElement('p', null, 'Page'),
      })
      const sheet = native.createRoute({
        getParentRoute: () => root,
        path: '/sheet/$id',
        staticData: { native: { presentation: 'formSheet' } },
        component: () => React.createElement('p', null, 'Sheet'),
      })
      let renders = 0
      const router = native.createRouter({
        routeTree: root.addChildren([page, sheet]),
        native: {
          initialContainer: 'main',
          containers: { main: { initialHref: '/page/0' } },
          renderStack: ({ children }) => {
            renders++
            return React.createElement(
              React.Fragment,
              null,
              children.map((item) =>
                React.createElement('section', { key: item.key }, item.content),
              ),
            )
          },
        },
      })
      const navigation = controller.getNativeNavigation(router)
      await navigation.initialize()
      for (let index = 1; index < count; index++) {
        await navigation.navigate({
          href: `/${sheets && index % 2 ? 'sheet' : 'page'}/${index}`,
        })
      }
      const view = render(
        React.createElement(native.RouterProvider, { router }),
      )
      const tick = async () => {
        await act(() => navigation.navigate({ href: '/page/author' }))
        await act(() => navigation.back())
      }
      await tick()
      const before = renders
      const result = await bench(
        'native provider + custom stack push/back',
        tick,
      ).run({ time: 500, warmupIterations: 5 })
      expect(renders).toBeGreaterThan(before)
      expect(navigation.getSnapshot().stacks.main).toHaveLength(count)
      console.log(
        JSON.stringify({
          count,
          sheets,
          name: result.name,
          meanMs: result.latency.mean,
          hz: result.throughput.mean,
          p99Ms: result.latency.p99,
          p999Ms: result.latency.p999,
          rme: result.latency.rme,
          samples: result.latency.samplesCount,
        }),
      )
      view.unmount()
      navigation.dispose()
    })
  }
}
