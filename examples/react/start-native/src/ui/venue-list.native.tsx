import { Link } from '@tanstack/react-router'
import { ScrollView, Text, View } from 'react-native'
import type { readVenues } from '../data.server'

export function VenueList({
  venues,
  title,
}: {
  venues: ReturnType<typeof readVenues>
  title: string
}) {
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: 24, gap: 20 }}
    >
      <Text style={{ color: '#7b776a', letterSpacing: 2, fontSize: 11 }}>
        FIELDNOTES / AROUND YOU
      </Text>
      <Text
        style={{
          fontSize: 38,
          color: '#203d32',
          fontWeight: '600',
          lineHeight: 43,
        }}
      >
        {title}
      </Text>
      <Text style={{ color: '#7b776a', lineHeight: 23 }}>
        Good places have a way of bringing us back. Keep a few close.
      </Text>
      {venues.map((venue) => (
        <Link
          key={venue.id}
          to="/venues/$venueId"
          params={{ venueId: venue.id }}
          search={{ section: 'menu' }}
          testID={`venue-${venue.id}`}
          style={{
            backgroundColor: '#e8e5d8',
            borderRadius: 18,
            padding: 24,
            gap: 12,
          }}
        >
          <View>
            <Text style={{ color: '#7b776a', fontSize: 11, letterSpacing: 2 }}>
              {venue.neighborhood.toUpperCase()}
            </Text>
            <Text
              style={{ fontSize: 27, color: '#203d32', marginVertical: 10 }}
            >
              {venue.name}
            </Text>
            <Text style={{ color: '#6c7268', lineHeight: 22 }}>
              {venue.description}
            </Text>
            <Text style={{ marginTop: 20, color: '#203d32' }}>
              Explore the place ↗
            </Text>
          </View>
        </Link>
      ))}
      <Text style={{ color: '#7b776a', fontSize: 12 }}>
        Native tabs and stacks · Shared TanStack routes · Start backend
      </Text>
    </ScrollView>
  )
}
