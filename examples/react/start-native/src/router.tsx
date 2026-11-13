import { createRouter } from '@tanstack/react-router'
import { apiOrigin } from './platform-config'
import { routeTree } from './routeTree.gen'
import { tabIcons } from './navigation-icons'

export function getRouter() {
  const options = {
    routeTree,
    context: {
      apiOrigin: apiOrigin,
    },
    defaultPreload: 'intent' as const,
    native: {
      linking: { prefixes: ['tanstack-native-lab://'] },
      initialContainer: 'feed',
      containers: {
        feed: { initialHref: '/', title: 'Discover', tab: tabIcons.feed },
        search: {
          initialHref: '/search',
          title: 'Search',
          tab: tabIcons.search,
        },
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
