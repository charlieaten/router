import { createFileRoute } from '@tanstack/react-router'
import { LabPage } from '../ui/navigation-lab'
export const Route = createFileRoute('/navigation-lab/saved/$section/$page')({
  staticData: {
    native: {
      keepActive: true,
      title: 'Saved places',
      header: { hidden: false },
    },
  },
  component: Page,
})
function Page() {
  const { section, page } = Route.useParams()
  return <LabPage section={section} page={page} saved />
}
