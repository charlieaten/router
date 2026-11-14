import { integrateStandardNavigator } from '@tanstack/react-router'
import type {
  NativeNavigatorOptions,
  AnyRouteMatch,
  ParsedLocation,
} from '@tanstack/react-router'
import { MaterialTabs, TastebudsTabs } from './standard-navigators'

const labels: Record<string, string> = {
  map: 'Map',
  explore: 'Explore',
  post: 'Post',
  activity: 'Activity',
  saved: 'My',
  archive: 'Archive',
  buds: 'Buds',
}
export const materialRenderer = integrateStandardNavigator(MaterialTabs, {
  screenOptions: ({ route }) => ({ title: labels[route.name] ?? route.name }),
})
export const tastebudsRenderer = integrateStandardNavigator(TastebudsTabs, {
  screenOptions: ({ route }) => ({ title: labels[route.name] ?? route.name }),
  listeners: {
    tabPress(event, { navigation }) {
      if (event.target === 'post') {
        event.preventDefault()
        let root = navigation
        while (root.getOwner()) {
          root = root.getOwner()!.navigation
        }
        void root.navigate({ href: '/compose', target: 'composer' })
      }
      if (event.target === 'saved' && event.data.isAlreadyFocused) {
        event.preventDefault()
        const child = navigation.getSnapshot().stacks.saved?.at(-1)?.navigator
        if (child) {
          void child.select(
            child.getSnapshot().selected === 'archive' ? 'buds' : 'archive',
          )
        }
      }
    },
  },
})
export function labNavigator(
  _match: AnyRouteMatch,
  location: ParsedLocation,
): NativeNavigatorOptions {
  return {
    initialLocation: location.pathname.startsWith('/navigation-lab/')
      ? { href: location.href, target: location.pathname.split('/')[2] }
      : undefined,
    initialContainer: 'map',
    backBehavior: 'none',
    renderContainer: tastebudsRenderer,
    containers: Object.fromEntries(
      ['map', 'explore', 'post', 'activity', 'saved'].map((key) => [
        key,
        {
          initialHref:
            key === 'saved'
              ? '/navigation-lab/saved'
              : `/navigation-lab/${key}/1`,
          title: labels[key],
        },
      ]),
    ),
  }
}
export function savedNavigator(
  _match: AnyRouteMatch,
  location: ParsedLocation,
): NativeNavigatorOptions {
  return {
    initialLocation: location.pathname.startsWith('/navigation-lab/saved/')
      ? { href: location.href, target: location.pathname.split('/')[3] }
      : undefined,
    initialContainer: 'archive',
    backBehavior: 'none',
    renderContainer: materialRenderer,
    containers: {
      archive: { initialHref: '/navigation-lab/saved/archive/1' },
      buds: { initialHref: '/navigation-lab/saved/buds/1' },
    },
  }
}
