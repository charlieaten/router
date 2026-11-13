// Native uses the same Start backend over HTTP. Server-only modules and Start's
// browser RPC runtime never enter the Metro dependency graph.
import type { readVenue } from './data.server'

type Venue = ReturnType<typeof readVenue>

export async function listVenues(): Promise<Array<Venue>> {
  const origin = process.env.EXPO_PUBLIC_API_ORIGIN ?? 'http://localhost:3050'
  const response = await fetch(`${origin}/api/venues`)
  if (!response.ok) {
    throw new Error(`Venue request failed: ${response.status}`)
  }
  return response.json()
}

export async function getVenue({
  data,
}: {
  data: { id: string; apiOrigin?: string }
}): Promise<Venue> {
  const response = await fetch(
    `${data.apiOrigin ?? 'http://localhost:3050'}/api/venues?id=${encodeURIComponent(data.id)}`,
  )
  if (!response.ok) {
    throw new Error(`Venue request failed: ${response.status}`)
  }
  return response.json()
}
