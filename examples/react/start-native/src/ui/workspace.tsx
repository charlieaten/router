import * as React from 'react'
import { Link, Outlet } from '@tanstack/react-router'

export function Workspace({
  workspaceId,
  execution,
}: {
  workspaceId: string
  execution: string
}) {
  const [count, setCount] = React.useState(0)
  return (
    <main>
      <h1>Workspace {workspaceId}</h1>
      <p>Parent execution {execution}</p>
      <button onClick={() => setCount((value) => value + 1)}>
        Parent counter: {count}
      </button>
      <nav>
        <Link
          to="/workspaces/$workspaceId/$section/$page"
          params={{ workspaceId, section: 'feed', page: '1' }}
        >
          Feed
        </Link>
        {' · '}
        <Link
          to="/workspaces/$workspaceId/$section/$page"
          params={{ workspaceId, section: 'search', page: '1' }}
        >
          Search
        </Link>
      </nav>
      <Outlet />
      <p>
        The native app retains independent child stacks for every workspace
        visit.
      </p>
    </main>
  )
}
export function WorkspacePage({
  workspaceId,
  section,
  page,
}: {
  workspaceId: string
  section: string
  page: string
}) {
  return (
    <section>
      <h2>
        {section} · Page {page}
      </h2>
      <textarea placeholder="A draft for this page…" />
      <p>
        <Link
          to="/workspaces/$workspaceId/$section/$page"
          params={{ workspaceId, section, page: String(Number(page) + 1) }}
        >
          Push page {Number(page) + 1}
        </Link>
      </p>
    </section>
  )
}
