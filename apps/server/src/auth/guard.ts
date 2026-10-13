import { getConnInfo } from '@hono/node-server/conninfo'
import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import type { SessionError } from '@repo/api'
import { Limiter } from './limiter.ts'

export interface AttemptLimits {
  perAddress: Limiter
  // Keyed by username and address together: keyed by username alone, anyone could
  // lock a person out by guessing wrong on purpose.
  perUsername: Limiter
  // Behind an HTTPS proxy, the client's address comes from X-Forwarded-For.
  trustProxy: boolean
}

// Generous for a person, tight for a script: a few devices behind one address, and
// ten wrong guesses at one username from one address before it has to wait.
export function attemptLimits(trustProxy: boolean): AttemptLimits {
  return {
    perAddress: new Limiter(30, 60 * 1000),
    perUsername: new Limiter(10, 15 * 60 * 1000),
    trustProxy,
  }
}

// Every sign-up, prelogin and sign-in counts against the address it came from.
export function limitAddress(limits: AttemptLimits) {
  return createMiddleware(async (c, next) => {
    const address = clientAddress(c, limits.trustProxy)
    if (limits.perAddress.blocked(address)) return tooManyAttempts(c)
    limits.perAddress.hit(address)
    await next()
  })
}

export function usernameKey(c: Context, limits: AttemptLimits, username: string) {
  return `${username} ${clientAddress(c, limits.trustProxy)}`
}

export function tooManyAttempts(c: Context) {
  return c.json({ error: 'too-many-attempts' } satisfies SessionError, 429)
}

// Behind an HTTPS proxy every request comes from the proxy, which adds the real
// address as the last X-Forwarded-For entry. Without one, that header could be made
// up, so it counts only when the operator says a proxy is in front (MIRADOR_TRUST_PROXY).
// An IPv6 address counts by its /64, since one connection usually holds a whole /64.
function clientAddress(c: Context, trustProxy: boolean) {
  let address: string | undefined
  if (trustProxy) address = c.req.header('x-forwarded-for')?.split(',').at(-1)?.trim()
  if (!address) {
    try {
      address = getConnInfo(c).remote.address
    } catch {
      address = undefined
    }
  }
  if (!address) return 'unknown'
  return address.includes(':') ? ipv6Prefix(address) : address
}

function ipv6Prefix(address: string) {
  const [head = '', tail = ''] = address.toLowerCase().split('::')
  const left = head ? head.split(':') : []
  const right = tail ? tail.split(':') : []
  const groups = address.includes('::')
    ? [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right]
    : left
  return `${groups.slice(0, 4).join(':')}::/64`
}

// Only the app's own pages may change anything. The session cookie is already
// SameSite=Strict and bodies must be JSON; this refuses any browser request that says
// it comes from another site.
export const sameOrigin = createMiddleware(async (c, next) => {
  const origin = c.req.header('origin')
  if (origin && !['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    const host = c.req.header('x-forwarded-host') ?? c.req.header('host')
    let originHost: string | undefined
    try {
      originHost = new URL(origin).host
    } catch {
      originHost = undefined
    }
    if (originHost !== host) return c.json({ error: 'cross-site' }, 403)
  }
  await next()
})
