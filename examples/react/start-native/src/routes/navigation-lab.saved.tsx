import { createFileRoute, Outlet } from '@tanstack/react-router'
import { savedNavigator } from '../lab-navigation'
export const Route = createFileRoute('/navigation-lab/saved')({
  staticData: {
    native: { navigator: savedNavigator, header: { hidden: true } },
  },
  component: Outlet,
})
