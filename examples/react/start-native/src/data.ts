import { createServerFn } from '@tanstack/react-start'
import { readVenue, readVenues } from './data.server'

export const listVenues = createServerFn().handler(() => readVenues())
export const getVenue = createServerFn()
  .validator((input: { id: string; apiOrigin?: string }) => input)
  .handler(({ data }) => readVenue(data.id))
