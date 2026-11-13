import { createFileRoute } from '@tanstack/react-router'
import { WorkspacePage } from '../ui/workspace'

export const Route = createFileRoute('/workspaces/$workspaceId/$section/$page')(
  {
    staticData: { native: { title: 'Nested stack' } },
    component: WorkspacePageRoute,
  },
)

function WorkspacePageRoute() {
  return <WorkspacePage {...Route.useParams()} />
}
