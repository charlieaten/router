import { createFileRoute } from '@tanstack/react-router'
import { Composer } from '../ui/composer'

export const Route = createFileRoute('/compose')({
  staticData: {
    native: { title: 'Write a review', presentation: 'formSheet' },
  },
  component: Composer,
})
