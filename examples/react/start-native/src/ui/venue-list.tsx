import { Link } from '@tanstack/react-router'
import type { readVenues } from '../data.server'

export function VenueList({
  venues,
  title,
}: {
  venues: ReturnType<typeof readVenues>
  title: string
}) {
  return (
    <>
      <div className="eyebrow">
        A LITTLE LESS SCROLLING. A LITTLE MORE DISCOVERY.
      </div>
      <h1>{title}</h1>
      <p className="intro">
        Good places have a way of bringing us back. Keep a few close.
      </p>
      <div className="cards">
        {venues.map((venue, index) => (
          <Link
            key={venue.id}
            to="/venues/$venueId"
            params={{ venueId: venue.id }}
            search={{ section: 'menu' }}
            className="card"
            data-testid={`venue-${venue.id}`}
          >
            <div className={`art art-${index}`}>
              <span>0{index + 1}</span>
              <div className="arch" />
            </div>
            <div className="card-body">
              <small>{venue.neighborhood.toUpperCase()}</small>
              <h2>{venue.name}</h2>
              <p>{venue.description}</p>
              <span className="arrow">Explore the place ↗</span>
            </div>
          </Link>
        ))}
      </div>
      <aside>
        <strong>This is a working full-stack route.</strong> These places came
        from a Start server function. The native app reads the same backend
        through its HTTP route.
      </aside>
    </>
  )
}
