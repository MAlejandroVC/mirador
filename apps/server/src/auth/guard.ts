import { getConnInfo } from '@hono/node-server/conninfo'
import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import type { SessionError } from '@repo/api'
import { Limiter } from './limiter.ts'

export interface AttemptLimits {
  perAddress: Limiter
  // A whole IPv6 /48, which one person or company usually holds, as many /64s.
  perNetwork: Limiter
  // Keyed by username and address together (or by a device cookie): keyed by username
  // alone, anyone could lock a person out by guessing wrong on purpose.
  perUsername: Limiter
  // SEC-03: wrong guesses at one account from browsers that never signed in to it,
  // from any address. Someone with many addresses gets only this many guesses, and
  // the person's own devices aren't held up by it (see devices.ts).
  perAccount: Limiter
  // Behind an HTTPS proxy, the client's address comes from X-Forwarded-For.
  trustProxy: boolean
}

// Generous for a person, tight for a script: a few devices behind one address, and
// ten wrong guesses at one username from one address before it has to wait.
export function attemptLimits(trustProxy: boolean): AttemptLimits {
  return {
    perAddress: new Limiter(30, 60 * 1000),
    perNetwork: new Limiter(120, 60 * 1000),
    perUsername: new Limiter(10, 15 * 60 * 1000),
    perAccount: new Limiter(20, 60 * 60 * 1000),
    trustProxy,
  }
}

// Every sign-up, prelogin and sign-in counts against the address it came from.
export function limitAddress(limits: AttemptLimits) {
  return createMiddleware(async (c, next) => {
    const remote = remoteAddress(c, limits.trustProxy)
    const address = addressKey(remote)
    const network = remote.includes(':') ? ipv6Prefix(remote, 3) : null
    if (limits.perAddress.blocked(address)) return tooManyAttempts(c)
    if (network && limits.perNetwork.blocked(network)) return tooManyAttempts(c)
    limits.perAddress.hit(address)
    if (network) limits.perNetwork.hit(network)
    await next()
  })
}

export function usernameKey(c: Context, limits: AttemptLimits, username: string) {
  return `${username} ${clientAddress(c, limits.trustProxy)}`
}

// SEC-03: what a guess at an account's password counts against. From a browser that
// signed in to the account before (its device cookie), only that browser's own
// allowance; from any other, the username from that address and the whole account.
export function passwordGuesses(
  c: Context,
  limits: AttemptLimits,
  username: string,
  device: string | null,
) {
  const counted: [Limiter, string][] = device
    ? [[limits.perUsername, `device ${device}`]]
    : [
        [limits.perUsername, usernameKey(c, limits, username)],
        [limits.perAccount, username],
      ]
  return {
    blocked: () => counted.some(([limiter, key]) => limiter.blocked(key)),
    hit: () => {
      for (const [limiter, key] of counted) limiter.hit(key)
    },
    clear: () => {
      for (const [limiter, key] of counted) limiter.clear(key)
    },
  }
}

export function tooManyAttempts(c: Context) {
  return c.json({ error: 'too-many-attempts' } satisfies SessionError, 429)
}

// Behind an HTTPS proxy every request comes from the proxy, which adds the real
// address as the last X-Forwarded-For entry. Without one, that header could be made
// up, so it counts only when the operator says a proxy is in front (MIRADOR_TRUST_PROXY).
function remoteAddress(c: Context, trustProxy: boolean) {
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
  // An IPv4 address written as IPv6 (::ffff:192.0.2.1) is that IPv4 address.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)
  return mapped?.[1] ?? address
}

// An IPv6 address counts by its /64, since one connection usually holds a whole /64.
function addressKey(address: string) {
  return address.includes(':') ? ipv6Prefix(address, 4) : address
}

function clientAddress(c: Context, trustProxy: boolean) {
  return addressKey(remoteAddress(c, trustProxy))
}

// The first groups of an IPv6 address: 4 groups is its /64, 3 its /48.
function ipv6Prefix(address: string, groupCount: 3 | 4) {
  const [head = '', tail = ''] = address.toLowerCase().split('::')
  const left = head ? head.split(':') : []
  const right = tail ? tail.split(':') : []
  const groups = address.includes('::')
    ? [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right]
    : left
  return `${groups.slice(0, groupCount).join(':')}::/${groupCount * 16}`
}

// Only the app's own pages may change anything. The session cookie is already
// SameSite=Strict and bodies must be JSON; this refuses any request that changes
// something unless the browser says it comes from this site. Browsers send Origin with
// every such request; one without it (or Sec-Fetch-Site) didn't come from the app.
export function sameOrigin(trustProxy: boolean) {
  return createMiddleware(async (c, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) return next()
    const origin = c.req.header('origin')
    if (!origin) {
      if (c.req.header('sec-fetch-site') === 'same-origin') return next()
      return crossSite(c)
    }
    // Only a proxy the operator trusts may say which host the browser asked for.
    const host = (trustProxy ? c.req.header('x-forwarded-host') : undefined) ?? c.req.header('host')
    let originHost: string | undefined
    try {
      originHost = new URL(origin).host
    } catch {
      originHost = undefined
    }
    if (!host || originHost !== host) return crossSite(c)
    await next()
  })
}

function crossSite(c: Context) {
  return c.json({ error: 'cross-site' }, 403)
}
