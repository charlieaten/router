import { useBlocker, useNavigate } from '@tanstack/react-router'
import { useReviewComposer } from './use-review-composer'

export function Composer({ venueId }: { venueId: string }) {
  const { draft, setDraft, saving, error, shouldBlock, save } =
    useReviewComposer(venueId)
  const navigate = useNavigate()
  const blocker = useBlocker({
    shouldBlockFn: shouldBlock,
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
          data-testid="save-review"
          disabled={saving || !draft.trim()}
          onClick={async () => {
            if (await save()) {
              await navigate({
                to: '/venues/$venueId',
                params: { venueId },
                search: { section: 'reviews' },
              })
            }
          }}
        >
          {saving ? 'Saving…' : 'Save review'}
        </button>
        {error && <p role="alert">{error}</p>}
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
