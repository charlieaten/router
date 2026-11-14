import { createFileRoute, Outlet } from '@tanstack/react-router'
import { mainNavigator } from '../main-navigation'
export const Route = createFileRoute('/_tabs')({
  staticData: {
    native: {
      title: 'Discover',
      header: { hidden: true },
      navigator: mainNavigator,
    },
  },
  component: Outlet,
})
