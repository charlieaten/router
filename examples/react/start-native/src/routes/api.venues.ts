import { createFileRoute } from '@tanstack/react-router'
import { readVenue, readVenues } from '../data.server'

export const Route = createFileRoute('/api/venues')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const id = new URL(request.url).searchParams.get('id')
        return Response.json(id ? readVenue(id) : readVenues(), {
          headers: { 'Access-Control-Allow-Origin': '*' },
        })
      },
    },
  },
})
