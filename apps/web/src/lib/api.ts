import {
  errorResponse,
  pullResponse,
  pushConflict,
  type PushRequest,
  pushResponse,
  healthResponse,
  keysResponse,
  preloginResponse,
  sessionResponse,
  type SignUpRequest,
  signUpStatus,
} from '@repo/api'

// The server is untrusted: every response is checked against its schema. Works on
// the page and in the worker, which share the page's origin and cookies.

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code?: string,
    readonly body?: unknown,
  ) {
    super(code ?? `Request failed with ${status}`)
    this.name = 'ApiError'
  }
}

export type Fetch = typeof globalThis.fetch

export function createApi(fetchFn: Fetch = (...args) => globalThis.fetch(...args)) {
  async function request(path: string, init?: RequestInit) {
    const response = await fetchFn(path, {
      ...init,
      headers: init?.body ? { 'Content-Type': 'application/json' } : {},
      credentials: 'same-origin',
    })
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null)
      const parsed = errorResponse.safeParse(body)
      throw new ApiError(response.status, parsed.success ? parsed.data.error : undefined, body)
    }
    return response
  }

  const post = (path: string, body: unknown) =>
    request(path, { method: 'POST', body: JSON.stringify(body) })

  return {
    async health() {
      return healthResponse.parse(await (await request('/api/health')).json())
    },
    async session() {
      return sessionResponse.parse(await (await request('/api/session')).json())
    },
    async signUpStatus() {
      return signUpStatus.parse(await (await request('/api/accounts/sign-up')).json())
    },
    async signUp(body: SignUpRequest) {
      await post('/api/accounts', body)
    },
    async prelogin(username: string) {
      return preloginResponse.parse(
        await (await post('/api/accounts/prelogin', { username })).json(),
      )
    },
    // SEC-03: the login secret, never the password.
    async signIn(username: string, loginSecret: string) {
      await post('/api/session', { username, loginSecret })
    },
    async signOut() {
      await request('/api/session', { method: 'DELETE' })
    },
    async keys() {
      return keysResponse.parse(await (await request('/api/keys')).json())
    },
    async pullRecords(after: number) {
      return pullResponse.parse(await (await request(`/api/records?after=${after}`)).json())
    },
    // A 409 isn't a failure: nothing was saved, and these records changed elsewhere.
    async pushRecords(changes: PushRequest['changes']) {
      try {
        return pushResponse.parse(await (await post('/api/records', { changes })).json())
      } catch (error) {
        if (error instanceof ApiError && error.status === 409 && error.body) {
          return { conflicts: pushConflict.parse(error.body).conflicts }
        }
        throw error
      }
    },
  }
}

export type Api = ReturnType<typeof createApi>

export const api = createApi()
