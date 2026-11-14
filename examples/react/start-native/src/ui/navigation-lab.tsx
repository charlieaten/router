import { Link, Outlet } from '@tanstack/react-router'
export function NavigationLab() {
  return (
    <main>
      <h1>Standard Navigation native lab</h1>
      <p>
        Open this route on iOS or Android for animated tabs and the Material
        pager.
      </p>
      <nav>
        {['map', 'explore', 'activity'].map((tab) => (
          <Link
            key={tab}
            to="/navigation-lab/$tab/$page"
            params={{ tab, page: '1' }}
          >
            {tab}{' '}
          </Link>
        ))}
        <Link
          to="/navigation-lab/saved/$section/$page"
          params={{ section: 'archive', page: '1' }}
        >
          Saved
        </Link>
      </nav>
      <Outlet />
    </main>
  )
}
export function LabPage({
  section,
  page,
}: {
  section: string
  page: string
  saved: boolean
}) {
  return (
    <section>
      <h2>
        {section} · Page {page}
      </h2>
      <input placeholder="Page draft" />
    </section>
  )
}
