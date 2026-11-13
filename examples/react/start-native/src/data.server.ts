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

export function readVenues() {
  return venues
}

export function readVenue(id: string) {
  const venue = venues.find((item) => item.id === id)
  if (!venue) {
    throw new Error('Venue not found')
  }
  return venue
}
