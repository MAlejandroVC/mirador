import { type CreationOptions, type Invite, type Passkey, usernameCheckRequest } from '@repo/api'
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
    changeUsername: vi.fn((username: string) => {
      server.signedIn = username.trim().toLowerCase()
      return Promise.resolve()
    }),
    startAddingPasskey: vi.fn(() =>
      Promise.resolve({ challengeId: 'registration', options: fakeCreationOptions }),
    ),
    addPasskey: vi.fn(() => {
      server.passkeys = [
        ...(server.passkeys ?? []),
        {
          id: `passkey-${(server.passkeys?.length ?? 0) + 1}`,
          createdAt: '2026-10-13T12:00:00.000Z',
          lastUsedAt: null,
        },
      ]
      return Promise.resolve()
    }),
    passkeySignInOptions: vi.fn(() =>
      Promise.resolve({ challengeId: 'sign-in', options: { challenge: 'AAAA' } }),
    ),
    openWithPasskey: vi.fn(() => {
      unlocked = true
      server.signedIn ??= 'ana'
      return Promise.resolve()
    }),
    signOut: vi.fn(() => {
      unlocked = false
      server.signedIn = null
      return Promise.resolve()
    }),
    ...overrides,
  }
  return vault
}

export const fakeCreationOptions: CreationOptions = {
  challenge: 'AAAA',
  rp: { id: 'localhost', name: 'Mirador' },
  user: { id: 'MQ', name: 'ana', displayName: 'ana' },
  pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
}

export function unlockedVault(server: FakeServer) {
  const vault = fakeVault(server)
  void vault.unlock('')
  return vault
}

export interface FakeServer {
  signedIn?: string | null
  signUpMode?: 'setup' | 'open' | 'invite'
  healthy?: boolean
  // SYS-13: whether the signed-in user runs the server, and their invites.
  operator?: boolean
  invites?: Invite[]
  // SYS-06: the signed-in user's passkeys, and usernames other people have.
  passkeys?: Passkey[]
  takenUsernames?: string[]
}

// Answers the page's own requests (the vault's go through the fake vault).
export function stubServer(server: FakeServer) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
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
              server.signedIn
                ? {
                    user: {
                      id: '1',
                      username: server.signedIn,
                      operator: server.operator ?? false,
                    },
                  }
                : null,
            ),
          )
        case '/api/accounts/sign-up':
          return Promise.resolve(Response.json({ mode: server.signUpMode ?? 'open' }))
        case '/api/invites': {
          server.invites ??= []
          if (init?.method === 'POST') {
            const invite: Invite = {
              id: `invite-${server.invites.length + 1}`,
              createdAt: '2026-10-13T12:00:00.000Z',
              expiresAt: '2099-10-20T12:00:00.000Z',
              usedAt: null,
              usedBy: null,
            }
            server.invites.unshift(invite)
            return Promise.resolve(
              Response.json({ invite, code: 'ABCD-EFGH-JKMN-PQRS-TV23' }, { status: 201 }),
            )
          }
          return Promise.resolve(Response.json({ invites: server.invites }))
        }
        case '/api/passkeys':
          return Promise.resolve(Response.json({ passkeys: server.passkeys ?? [] }))
        case '/api/accounts/username-check': {
          const { username } = usernameCheckRequest.parse(JSON.parse(init?.body as string))
          return Promise.resolve(
            Response.json({ available: !server.takenUsernames?.includes(username) }),
          )
        }
        default: {
          const removed = /^\/api\/passkeys\/(.+)$/.exec(path)?.[1]
          if (removed && init?.method === 'DELETE') {
            server.passkeys = server.passkeys?.filter((passkey) => passkey.id !== removed) ?? []
            return Promise.resolve(new Response(null, { status: 204 }))
          }
          const withdrawn = /^\/api\/invites\/(.+)$/.exec(path)?.[1]
          if (withdrawn && init?.method === 'DELETE') {
            server.invites = server.invites?.filter((invite) => invite.id !== withdrawn) ?? []
            return Promise.resolve(new Response(null, { status: 204 }))
          }
          return Promise.resolve(new Response(null, { status: 404 }))
        }
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
