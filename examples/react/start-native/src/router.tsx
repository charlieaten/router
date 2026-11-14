import { createRouter } from '@tanstack/react-router'
import { apiOrigin } from './platform-config'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const options = {
    routeTree,
    context: {
      apiOrigin: apiOrigin,
    },
    defaultPreload: 'intent' as const,
    native: {
      linking: { prefixes: ['tanstack-native-lab://'] },
      rootKind: 'stack' as const,
      initialContainer: 'main',
      containers: {
        main: { initialHref: '/' },
        composer: { initialHref: '/compose', overlay: true },
      },
    },
  }
  return createRouter(options)
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
