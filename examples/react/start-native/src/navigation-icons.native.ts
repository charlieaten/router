import type { NativeNavigationContainer } from '@tanstack/react-router'

export const tabIcons = {
  feed: {
    ios: {
      icon: { type: 'sfSymbol', name: 'safari' },
      selectedIcon: { type: 'sfSymbol', name: 'safari.fill' },
    },
    android: { icon: { type: 'drawableResource', name: 'ic_menu_mapmode' } },
  },
  search: {
    ios: { icon: { type: 'sfSymbol', name: 'magnifyingglass' } },
    android: { icon: { type: 'drawableResource', name: 'ic_menu_search' } },
  },
} satisfies Record<string, NonNullable<NativeNavigationContainer['tab']>>
