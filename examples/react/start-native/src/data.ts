import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { readVenue, readVenues, writeReview } from './data.server'

export const listVenues = createServerFn().handler(() => readVenues())
export const getVenue = createServerFn()
  .validator((input: { id: string; apiOrigin?: string }) => input)
  .handler(({ data }) => readVenue(data.id))

export const saveReview = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      venueId: z.string().min(1),
      body: z.string().trim().min(1).max(2000),
    }),
  )
  .handler(({ data }) => writeReview(data.venueId, data.body))
