import * as React from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import type { readVenue } from '../data.server'

export function VenueDetail({
  venue,
  section,
}: {
  venue: ReturnType<typeof readVenue>
  section: string
}) {
  const [note, setNote] = React.useState('')
  const navigate = useNavigate()
  return (
    <>
      <div className="eyebrow">
        {venue.neighborhood.toUpperCase()} / SAVED FOR LATER
      </div>
      <h1>{venue.name}</h1>
      <p className="intro">{venue.description}</p>
      <div className="detail-panel">
        <div className="actions">
          <button
            onClick={() =>
              void navigate({
                to: '/venues/$venueId',
                params: { venueId: venue.id },
                search: { section: 'menu' },
                replace: true,
              })
            }
          >
            Menu
          </button>
          <button
            data-testid="show-reviews"
            onClick={() =>
              void navigate({
                to: '/venues/$venueId',
                params: { venueId: venue.id },
                search: { section: 'reviews' },
                replace: true,
              })
            }
          >
            Reviews
          </button>
        </div>
        <h2 data-testid="section">
          {section === 'reviews'
            ? 'Notes from the neighborhood'
            : 'Something for a slow afternoon'}
        </h2>
        <p>
          {section === 'reviews'
            ? '“The kind of place you tell a friend about.”'
            : 'Seasonal lunch · Espresso · Something freshly baked'}
        </p>
        <label htmlFor="note">Your private note</label>
        <textarea
          id="note"
          data-testid="private-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="A reason to come back…"
        />
        {section === 'reviews' &&
          venue.reviews.map((review) => <p key={review.id}>{review.body}</p>)}
        <Link to="/compose" search={{ venueId: venue.id }} className="primary">
          Write a review ↗
        </Link>
      </div>
    </>
  )
}
