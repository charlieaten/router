import type {
  AnyRouteMatch,
  NativeNavigatorOptions,
  ParsedLocation,
} from '@tanstack/react-router'
import { tabIcons } from './navigation-icons'
export function mainNavigator(
  _match: AnyRouteMatch,
  location: ParsedLocation,
): NativeNavigatorOptions {
  return {
    initialLocation: {
      href: location.href,
      target: location.pathname === '/search' ? 'search' : 'feed',
    },
    initialContainer: 'feed',
    containers: {
      feed: { initialHref: '/', title: 'Discover', tab: tabIcons.feed },
      search: { initialHref: '/search', title: 'Search', tab: tabIcons.search },
    },
  }
}
