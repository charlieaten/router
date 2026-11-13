import { createFileRoute } from '@tanstack/react-router'
import { Composer } from '../ui/composer'
import { z } from 'zod'

export const Route = createFileRoute('/compose')({
  validateSearch: z.object({ venueId: z.coerce.string().default('123') }),
  staticData: {
    native: { title: 'Write a review', presentation: 'formSheet' },
  },
  component: Compose,
})

function Compose() {
  return <Composer venueId={Route.useSearch().venueId} />
}
