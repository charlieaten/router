import { createFileRoute } from '@tanstack/react-router'
import { LabPage } from '../ui/navigation-lab'
export const Route = createFileRoute('/navigation-lab/$tab/$page')({
  staticData: { native: { title: 'Places', header: { hidden: false } } },
  component: Page,
})
function Page() {
  const { tab, page } = Route.useParams()
  return <LabPage section={tab} page={page} saved={false} />
}
