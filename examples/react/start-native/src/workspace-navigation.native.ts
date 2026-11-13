import type {
  AnyRouteMatch,
  ParsedLocation,
  NativeNavigatorOptions,
} from '@tanstack/react-router'
import { tabIcons } from './navigation-icons'

export function workspaceNavigator(
  match: AnyRouteMatch,
  location: ParsedLocation,
): NativeNavigatorOptions {
  const base = `/workspaces/${encodeURIComponent(match.params.workspaceId)}`
  const section = location.pathname.slice(base.length + 1).split('/')[0]
  return {
    initialLocation:
      section === 'feed' || section === 'search'
        ? { href: location.href, target: section }
        : undefined,
    initialContainer: 'feed',
    backBehavior: 'none',
    containers: {
      feed: {
        initialHref: `${base}/feed/1`,
        title: 'Feed',
        tab: tabIcons.feed,
      },
      search: {
        initialHref: `${base}/search/1`,
        title: 'Search',
        tab: tabIcons.search,
      },
    },
  }
}
