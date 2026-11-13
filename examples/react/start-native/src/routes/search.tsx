import { createFileRoute } from '@tanstack/react-router'
import { listVenues } from '../data'
import { VenueList } from '../ui/venue-list'

export const Route = createFileRoute('/search')({
  staticData: { native: { title: 'Search' } },
  loader: () => listVenues(),
  component: Search,
})

function Search() {
  return (
    <VenueList
      venues={Route.useLoaderData()}
      title="Find your next favorite."
    />
  )
}
