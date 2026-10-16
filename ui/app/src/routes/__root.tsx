/// <reference types="vite/client" />
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import * as React from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { QueryClientProvider } from '@tanstack/react-query'
import appCss from '~/styles/app.css?url'

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
}>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { title: 'nozzle: workflow console' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap',
      },
    ],
  }),
  component: RootComponent,
})

const NAV = [
  { to: '/', label: 'Workflows' },
  { to: '/bundles', label: 'Bundles' },
  { to: '/workers', label: 'Workers' },
  { to: '/settings', label: 'Settings' },
] as const

function RootComponent() {
  const { queryClient } = Route.useRouteContext()
  return (
    <RootDocument>
      <QueryClientProvider client={queryClient}>
        <div className="app">
          <aside className="sidebar">
            <div className="brand">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M3 3h18l-6.5 8v5l-3 2.5V11z" />
                <circle cx="12" cy="21.5" r="1.5" />
              </svg>
              nozzle
            </div>
            <nav className="side-nav" aria-label="Console sections">
              {NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  activeProps={{ className: 'active', 'aria-current': 'page' }}
                  activeOptions={{ exact: item.to === '/' }}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <p className="side-foot">Live data from the orchestrator API.</p>
          </aside>
          <main className="page">
            <Outlet />
          </main>
        </div>
      </QueryClientProvider>
    </RootDocument>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
