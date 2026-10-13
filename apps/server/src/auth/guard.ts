import { getConnInfo } from '@hono/node-server/conninfo'
import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import type { SessionError } from '@repo/api'
import { Limiter } from './limiter.ts'

export interface AttemptLimits {
  perAddress: Limiter
  perUsername: Limiter
}

// Generous for a person, tight for a script: a few devices behind one address, and
// ten wrong guesses at one username before it has to wait.
export function attemptLimits(): AttemptLimits {
  return {
    perAddress: new Limiter(30, 60 * 1000),
    perUsername: new Limiter(10, 15 * 60 * 1000),
  }
}

// Every sign-up, prelogin and sign-in counts against the address it came from.
export function limitAddress(limits: AttemptLimits) {
  return createMiddleware(async (c, next) => {
    const address = clientAddress(c)
    if (limits.perAddress.blocked(address)) return tooManyAttempts(c)
    limits.perAddress.hit(address)
    await next()
  })
}

export function tooManyAttempts(c: Context) {
  return c.json({ error: 'too-many-attempts' } satisfies SessionError, 429)
}

// Behind the release image's HTTPS proxy (Caddy) every request comes from the proxy,
// which adds the real address as the last X-Forwarded-For entry. A server reached
// without a proxy could be sent a made-up header, which only weakens this limit: the
// per-username one still holds.
function clientAddress(c: Context) {
  const forwarded = c.req.header('x-forwarded-for')?.split(',').at(-1)?.trim()
  if (forwarded) return forwarded
  try {
    return getConnInfo(c).remote.address ?? 'unknown'
  } catch {
    return 'unknown'
  }
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
