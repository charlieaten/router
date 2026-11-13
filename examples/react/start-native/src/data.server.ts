const venues = [
  {
    id: '123',
    name: 'The Glasshouse',
    neighborhood: 'Westlands',
    description: 'A quiet courtyard, seasonal plates, and very good coffee.',
  },
  {
    id: '456',
    name: 'Sunday Table',
    neighborhood: 'Kilimani',
    description:
      'A neighborhood kitchen for slow lunches and long conversations.',
  },
]

// Demo storage only: survives requests, but not a server restart.
const reviews = new Map<string, Array<{ id: string; body: string }>>()

export function readVenues() {
  return venues
}

export function readVenue(id: string) {
  const venue = venues.find((item) => item.id === id)
  if (!venue) {
    throw new Error('Venue not found')
  }
  return { ...venue, reviews: reviews.get(id) ?? [] }
}

export function writeReview(venueId: string, body: string) {
  readVenue(venueId)
  const review = { id: crypto.randomUUID(), body }
  reviews.set(venueId, [...(reviews.get(venueId) ?? []), review])
  return review
}
