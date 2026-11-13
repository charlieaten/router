import { Outlet, createRootRouteWithContext } from '@tanstack/react-router'
import { RootDocument } from '../ui/root-document'

export const Route = createRootRouteWithContext<{ apiOrigin: string }>()({
  shellComponent: RootDocument,
  component: Outlet,
})
