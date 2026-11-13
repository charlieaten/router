import * as React from 'react'
import { useRouter } from '@tanstack/react-router'
import { saveReview } from '../data'

export function useReviewComposer(venueId: string) {
  const router = useRouter()
  const [draft, setDraft] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string>()
  const dirty = React.useRef(false)
  const pending = React.useRef(false)
  return {
    draft,
    saving,
    error,
    setDraft(value: string) {
      dirty.current = value.length > 0
      setDraft(value)
    },
    shouldBlock: () => dirty.current,
    async save() {
      if (pending.current || !draft.trim()) {
        return false
      }
      pending.current = true
      setSaving(true)
      setError(undefined)
      try {
        await saveReview({ data: { venueId, body: draft } })
        dirty.current = false
        setDraft('')
        await router.invalidate()
        return true
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : 'Unable to save review',
        )
        return false
      } finally {
        pending.current = false
        setSaving(false)
      }
    },
  }
}
