import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { getVenue } from '../data'
import { VenueDetail } from '../ui/venue-detail'

export const Route = createFileRoute('/venues/$venueId')({
  staticData: { native: { title: 'Fieldnotes' } },
  validateSearch: z.object({
    section: z.enum(['menu', 'reviews']).default('menu'),
  }),
  loader: ({ params, context, abortController }) =>
    getVenue({
      data: { id: params.venueId, apiOrigin: context.apiOrigin },
      signal: abortController.signal,
    }),
  component: Detail,
})

function Detail() {
  return (
    <VenueDetail
      venue={Route.useLoaderData()}
      section={Route.useSearch().section}
    />
  )
}
