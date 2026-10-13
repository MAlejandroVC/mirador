import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render } from '@testing-library/react'
import { vi } from 'vitest'
import type { VaultClient } from './lib/vault'
import type { RecoverInput, SignUpInput } from './worker/vault'
import { createAppRouter } from './router'

export const shownRecoveryKey =
  'ABCD-EFGH-JKMN-PQRS-TVWX-YZ01-2345-6789-ABCD-EFGH-JKMN-PQRS-TVWX-YZ01'

// A vault that does no cryptography: screen tests check what the screens do with its
// answers. The real one is tested in worker/vault.test.ts.
export function fakeVault(server: FakeServer, overrides: Partial<VaultClient> = {}) {
  let unlocked = false
  const vault: VaultClient = {
    status: vi.fn(() => Promise.resolve(unlocked ? ('unlocked' as const) : ('locked' as const))),
    signUp: vi.fn(({ username }: SignUpInput) => {
      unlocked = true
      server.signedIn = username
      return Promise.resolve({ recoveryKey: shownRecoveryKey })
    }),
    signIn: vi.fn((username: string) => {
      unlocked = true
      server.signedIn = username
      return Promise.resolve()
    }),
    recover: vi.fn(({ username }: RecoverInput) => {
      unlocked = true
      server.signedIn = username
      return Promise.resolve()
    }),
    unlock: vi.fn(() => {
      unlocked = true
      return Promise.resolve()
    }),
    lock: vi.fn(() => {
      unlocked = false
      return Promise.resolve()
    }),
    changePassword: vi.fn(() => Promise.resolve()),
    replaceRecoveryKey: vi.fn(() => Promise.resolve({ recoveryKey: shownRecoveryKey })),
    signOutOthers: vi.fn(() => Promise.resolve(2)),
    signOut: vi.fn(() => {
      unlocked = false
      server.signedIn = null
      return Promise.resolve()
    }),
    ...overrides,
  }
  return vault
}

export function unlockedVault(server: FakeServer) {
  const vault = fakeVault(server)
  void vault.unlock('')
  return vault
}

export interface FakeServer {
  signedIn?: string | null
  signUpMode?: 'setup' | 'open' | 'closed'
  healthy?: boolean
}

// Answers the page's own requests (the vault's go through the fake vault).
export function stubServer(server: FakeServer) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const path = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      switch (path) {
        case '/api/health':
          return Promise.resolve(
            server.healthy === false
              ? new Response(null, { status: 503 })
              : Response.json({ status: 'ok' }),
          )
        case '/api/session':
          return Promise.resolve(
            Response.json(
              server.signedIn ? { user: { id: '1', username: server.signedIn } } : null,
            ),
          )
        case '/api/accounts/sign-up':
          return Promise.resolve(Response.json({ mode: server.signUpMode ?? 'open' }))
        default:
          return Promise.resolve(new Response(null, { status: 404 }))
      }
    }),
  )
}

export function renderApp(path: string, vault: VaultClient) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createAppRouter(
    queryClient,
    vault,
    createMemoryHistory({ initialEntries: [path] }),
  )
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { router, queryClient }
}
