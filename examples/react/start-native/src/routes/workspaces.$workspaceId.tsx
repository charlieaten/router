import type { ReactElement } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { workspaceNavigator } from '../workspace-navigation'
import { Workspace } from '../ui/workspace'

export const Route = createFileRoute('/workspaces/$workspaceId')({
  staticData: {
    native: { title: 'Workspace visits', navigator: workspaceNavigator },
  },
  loader: (): { execution: string } => ({
    execution: Math.random().toString(36).slice(2, 8),
  }),
  component: WorkspaceRoute,
})

function WorkspaceRoute(): ReactElement {
  return (
    <Workspace
      workspaceId={Route.useParams().workspaceId}
      execution={Route.useLoaderData().execution}
    />
  )
}
