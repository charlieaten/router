import { HeadContent, Link, Scripts } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import css from './styles.css?url'

export function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Fieldnotes · TanStack everywhere</title>
        <link rel="stylesheet" href={css} />
        <HeadContent />
      </head>
      <body>
        <div className="app">
          <header>
            <Link to="/" className="brand">
              fieldnotes<span>THE NATIVE ROUTER LAB</span>
            </Link>
            <nav>
              <Link to="/">Discover</Link>
              <Link to="/search">Search</Link>
              <Link to="/compose">Write a review ↗</Link>
            </nav>
          </header>
          <main>{children}</main>
          <footer>
            ONE ROUTE TREE. TWO VERY DIFFERENT PLATFORMS.
            <span>TanStack Start × Screens v5</span>
          </footer>
        </div>
        <Scripts />
      </body>
    </html>
  )
}
