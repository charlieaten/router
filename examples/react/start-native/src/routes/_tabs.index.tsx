import { createFileRoute } from '@tanstack/react-router'
import { listVenues } from '../data'
import { VenueList } from '../ui/venue-list'

export const Route = createFileRoute('/_tabs/')({
  staticData: { native: { title: 'Discover' } },
  loader: ({ abortController }) =>
    listVenues({ signal: abortController.signal }),
  component: Home,
})

function Home() {
  return (
    <VenueList
      venues={Route.useLoaderData()}
      title="Somewhere worth staying."
    />
  )
}
