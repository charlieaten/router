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
        staticData: {
          native: {
            header: {
              ios: {
                titleItem: {
                  id: 'title',
                  render: () => React.createElement('span', null, 'Title'),
                },
              },
            },
          },
        },
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
              children.map((item) => {
                const content = React.createElement(
                  'section',
                  null,
                  item.options?.header?.ios?.titleItem?.render?.(),
                  item.content,
                )
                return React.createElement(
                  React.Fragment,
                  { key: item.key },
                  item.wrap ? item.wrap(content) : content,
                )
              }),
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

for (const presenter of ['default', 'shared'] as const) {
  for (const count of [10, 100]) {
    for (const slots of [0, 3]) {
      test(`visit boundary ${presenter} ${count} visits ${slots} slots`, async ({
        bench,
      }) => {
        const React = await import('react')
        const { act, render } = await import('@testing-library/react')
        const native = await import('../dist/native/esm/index.native.js')
        const { getNativeNavigation } =
          await import('../dist/native/esm/native/controller.js')
        const { Stack } = await import('./native-screens')
        const root = native.createRootRoute({ component: native.Outlet })
        let mounts = 0
        let renders = 0
        function Title() {
          const { id } = native.useParams({ strict: false })
          renders++
          React.useState(() => {
            mounts++
            return null
          })
          return React.createElement('span', { 'data-title': id }, id)
        }
        const title = () => React.createElement(Title)
        const page = native.createRoute({
          getParentRoute: () => root,
          path: '/page/$id',
          staticData: {
            native: {
              header: slots
                ? {
                    ios: {
                      titleItem: { id: 'title', render: title },
                      leadingItems: [
                        { id: 'leading', type: 'item', render: title },
                      ],
                      trailingItems: [
                        { id: 'trailing', type: 'item', render: title },
                      ],
                    },
                  }
                : undefined,
            },
          },
          component: () => React.createElement('p', null, page.useParams().id),
        })
        const router = native.createRouter({
          routeTree: root.addChildren([page]),
          native: {
            initialContainer: 'main',
            containers: { main: { initialHref: '/page/0' } },
            renderStack:
              presenter === 'default'
                ? undefined
                : ({ children }) =>
                    React.createElement(
                      React.Fragment,
                      null,
                      children.map((item) => {
                        const content = React.createElement(
                          'section',
                          null,
                          React.createElement(
                            Stack.HeaderConfig,
                            item.options?.header,
                          ),
                          item.content,
                        )
                        return React.createElement(
                          React.Fragment,
                          { key: item.key },
                          item.wrap ? item.wrap(content) : content,
                        )
                      }),
                    ),
          },
        })
        const navigation = getNativeNavigation(router)
        await navigation.initialize()
        for (let i = 1; i < count; i++) {
          await navigation.navigate({ href: `/page/${i}` })
        }
        const view = render(
          React.createElement(native.RouterProvider, { router }),
        )
        await act(async () => {
          await Promise.resolve()
        })
        expect(
          view.container.querySelectorAll('[data-title="0"]'),
        ).toHaveLength(slots)
        const tick = async () => {
          await act(() => navigation.navigate({ href: '/page/author' }))
          await act(() => navigation.back())
        }
        await tick()
        const beforeMounts = mounts
        const beforeRenders = renders
        const result = await bench('visit boundary push/pop', tick).run({
          time: 1000,
          warmupIterations: 5,
        })
        expect(
          view.container.querySelectorAll('[data-title="0"]'),
        ).toHaveLength(slots)
        expect(navigation.getSnapshot().stacks.main).toHaveLength(count)
        console.log(
          JSON.stringify({
            presenter,
            count,
            slots,
            meanMs: result.latency.mean,
            p99Ms: result.latency.p99,
            p999Ms: result.latency.p999,
            rme: result.latency.rme,
            samples: result.latency.samplesCount,
            mounts: mounts - beforeMounts,
            renders: renders - beforeRenders,
          }),
        )
        view.unmount()
        navigation.dispose()
      })
    }
  }
}

for (const count of [2, 5]) {
  test(`plain tab presentation with ${count} tabs`, async ({ bench }) => {
    const React = await import('react')
    const { act, render } = await import('@testing-library/react')
    const native = await import('../dist/native/esm/index.native.js')
    const controller = await import('../dist/native/esm/native/controller.js')
    Object.assign(window, { scrollTo: () => {} })
    const root = native.createRootRoute({ component: native.Outlet })
    let mounts = 0
    const routes = Array.from({ length: count }, (_, index) =>
      native.createRoute({
        getParentRoute: () => root,
        path: `/tab-${index}`,
        component: function TabPage() {
          React.useState(() => ++mounts)
          return React.createElement('p', null, `Tab ${index}`)
        },
      }),
    )
    const router = native.createRouter({
      routeTree: root.addChildren(routes),
      native: {
        rootKind: 'tabs',
        initialContainer: 'tab-0',
        containers: Object.fromEntries(
          routes.map((_, index) => [
            `tab-${index}`,
            { initialHref: `/tab-${index}` },
          ]),
        ),
      },
    })
    const navigation = controller.getNativeNavigation(router)
    await navigation.initialize()
    const view = render(React.createElement(native.RouterProvider, { router }))
    const tick = async () => {
      for (let index = 1; index < count; index++) {
        await act(() => navigation.select(`tab-${index}`))
      }
      await act(() => navigation.select('tab-0'))
    }
    await tick()
    expect(navigation.getFocusedContainer()).toBe('tab-0')
    expect(mounts).toBe(count)
    const retainedKeys = navigation.getEntries().map((entry) => entry.key)
    const result = await bench(
      'select retained tabs through native provider',
      tick,
    ).run({ time: 1000, warmupIterations: 10 })
    console.log(
      JSON.stringify({
        count,
        name: result.name,
        meanMs: result.latency.mean,
        p99Ms: result.latency.p99,
        p999Ms: result.latency.p999,
        rme: result.latency.rme,
        samples: result.latency.samplesCount,
      }),
    )
    expect(mounts).toBe(count)
    expect(navigation.getEntries().map((entry) => entry.key)).toEqual(
      retainedKeys,
    )
    view.unmount()
    router.history.destroy()
  })
}

for (const depth of [1, 50, 200]) {
  test(`owner-resolver ordinary leaf at stack depth ${depth}`, async ({
    bench,
  }) => {
    const root = createRootRoute()
    const layout = createRoute({
      getParentRoute: () => root,
      id: '_tabs',
      staticData: {
        native: {
          navigator: {
            rootKind: 'tabs',
            initialContainer: 'map',
            containers: {
              map: { initialHref: '/' },
              saved: { initialHref: '/saved' },
            },
          },
        },
      },
    })
    const map = createRoute({
      getParentRoute: () => layout,
      id: '_map',
      staticData: {
        native: {
          navigator: {
            rootKind: 'custom',
            initialContainer: 'main',
            containers: { main: { initialHref: '/', kind: 'stack' } },
          },
        },
      },
    })
    const home = createRoute({ getParentRoute: () => map, path: '/' })
    const item = createRoute({ getParentRoute: () => map, path: '/item/$id' })
    const saved = createRoute({ getParentRoute: () => layout, path: '/saved' })
    const router = createRouter({
      routeTree: root.addChildren([
        layout.addChildren([map.addChildren([home, item]), saved]),
      ]),
    })
    const navigation = getNativeNavigation(router)
    await navigation.initialize()
    const tabs = navigation.getSnapshot().stacks.main![0]!.navigator!
    const stack = tabs.getSnapshot().stacks.map![0]!.navigator!
    await stack.reset(
      'main',
      Array.from({ length: depth }, (_, i) => `/item/${i}`),
    )
    const original = navigation.getActiveEntry()
    const tick = async () => {
      await router.navigate({ to: '/item/$id', params: { id: 'next' } })
      await navigation.back()
    }
    await tick()
    expect(navigation.getActiveEntry()).toBe(original)
    const result = await bench(`leaf-${depth}`, tick).run({
      time: 700,
      warmupIterations: 20,
    })
    console.log(
      JSON.stringify({
        name: result.name,
        meanMs: result.latency.mean,
        p99Ms: result.latency.p99,
        p999Ms: result.latency.p999,
        hz: result.throughput.mean,
        rme: result.latency.rme,
        samples: result.latency.samplesCount,
      }),
    )
    expect(stack.getSnapshot().stacks.main).toHaveLength(depth)
    router.history.destroy()
  })
}
