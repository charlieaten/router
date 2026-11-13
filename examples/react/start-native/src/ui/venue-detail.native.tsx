import * as React from 'react'
import { Link, useNavigate, useNavigation } from '@tanstack/react-router'
import { Pressable, ScrollView, Text, TextInput } from 'react-native'
import type { readVenue } from '../data.server'

export function VenueDetail({
  venue,
  section,
}: {
  venue: ReturnType<typeof readVenue>
  section: string
}) {
  const [note, setNote] = React.useState('')
  const [visit] = React.useState(() => Date.now().toString(36))
  const navigate = useNavigate()
  const navigation = useNavigation()
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: 24, gap: 20 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={{ color: '#7b776a', letterSpacing: 2 }}>
        {venue.neighborhood.toUpperCase()}
      </Text>
      <Text style={{ fontSize: 38, color: '#203d32' }}>{venue.name}</Text>
      <Text style={{ color: '#7b776a', lineHeight: 24 }}>
        {venue.description}
      </Text>
      <Text testID="section" style={{ fontSize: 24, color: '#203d32' }}>
        {section === 'reviews'
          ? 'Notes from the neighborhood'
          : 'Something for a slow afternoon'}
      </Text>
      <Pressable
        testID="show-reviews"
        onPress={() =>
          void navigate({
            to: '/venues/$venueId',
            params: { venueId: venue.id },
            search: { section: 'reviews' },
            stackBehavior: 'reuse',
          })
        }
      >
        <Text style={{ color: '#b05937' }}>
          Reuse this visit → show reviews
        </Text>
      </Pressable>
      <TextInput
        testID="private-note"
        value={note}
        onChangeText={setNote}
        placeholder="Your private note…"
        style={{
          backgroundColor: '#e8e5d8',
          padding: 18,
          borderRadius: 12,
          minHeight: 80,
        }}
      />
      <Link
        to="/venues/$venueId"
        params={{ venueId: venue.id }}
        search={{ section: 'menu' }}
        stackBehavior="push"
        testID="push-duplicate"
      >
        <Text style={{ color: '#203d32' }}>
          Push another visit to this venue ↗
        </Text>
      </Link>
      <Link
        to="/compose"
        target="composer"
        testID="open-composer"
        style={{ backgroundColor: '#203d32', padding: 18, borderRadius: 12 }}
      >
        <Text style={{ color: '#fff' }}>Write a review ↗</Text>
      </Link>
      <Pressable testID="back" onPress={() => void navigation.back()}>
        <Text style={{ color: '#203d32' }}>← Back</Text>
      </Pressable>
      <Text testID="visit-id" style={{ color: '#7b776a', fontSize: 11 }}>
        VISIT {visit}
      </Text>
    </ScrollView>
  )
}
