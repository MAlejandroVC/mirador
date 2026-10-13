import {
  healthResponse,
  keysResponse,
  preloginResponse,
  sessionResponse,
  signUpError,
  type SignUpRequest,
  signUpStatus,
} from '@repo/api'

// The server is untrusted: every response is checked against its schema. Works on
// the page and in the worker, which share the page's origin and cookies.

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code?: string,
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
      const parsed = signUpError.safeParse(body)
      throw new ApiError(response.status, parsed.success ? parsed.data.error : undefined)
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
      return sessionResponse.parse(await (await request('/api/auth/get-session')).json())
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
    // SEC-03: Better Auth's "password" is the login secret, never the password.
    async signIn(username: string, loginSecret: string) {
      await post('/api/auth/sign-in/username', {
        username,
        password: loginSecret,
        rememberMe: true,
      })
    },
    async signOut() {
      await post('/api/auth/sign-out', {})
    },
    async keys() {
      return keysResponse.parse(await (await request('/api/keys')).json())
    },
  }
}

export type Api = ReturnType<typeof createApi>

export const api = createApi()
