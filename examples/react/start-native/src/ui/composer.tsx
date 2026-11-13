import * as React from 'react'
import { useBlocker, useNavigate } from '@tanstack/react-router'

export function Composer() {
  const [draft, setDraft] = React.useState('')
  const navigate = useNavigate()
  const blocker = useBlocker({
    shouldBlockFn: () => draft.length > 0,
    withResolver: true,
  })
  return (
    <>
      <div className="eyebrow">A SMALL NOTE GOES A LONG WAY.</div>
      <h1>Tell us what stayed.</h1>
      <div className="detail-panel">
        <label htmlFor="review">Your review</label>
        <textarea
          id="review"
          data-testid="review"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="The coffee, the courtyard, the conversation…"
        />
        <button
          data-testid="leave-composer"
          onClick={() => void navigate({ to: '/' })}
        >
          Leave this page
        </button>
        {blocker.status === 'blocked' && (
          <div role="alertdialog">
            <p>Discard your unfinished review?</p>
            <button data-testid="discard" onClick={blocker.proceed}>
              Discard
            </button>
            <button onClick={blocker.reset}>Keep writing</button>
          </div>
        )}
      </div>
    </>
  )
}
