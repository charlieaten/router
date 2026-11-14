import { createFileRoute } from '@tanstack/react-router'
import { listVenues } from '../data'
import { VenueList } from '../ui/venue-list'

export const Route = createFileRoute('/_tabs/search')({
  staticData: { native: { title: 'Search' } },
  loader: ({ abortController }) =>
    listVenues({ signal: abortController.signal }),
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
