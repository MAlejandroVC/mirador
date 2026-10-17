import type { Context } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { randomToken, sameText, steadyBytes } from './secrets.ts'

// SEC-03: a browser that has signed in to an account gets this cookie. Wrong guesses
// at that account from other browsers are capped for the whole account, whatever
// address they come from; this browser has its own allowance, so someone guessing on
// purpose can't keep the person out of their own devices. (OWASP calls these device
// cookies.) It holds no session and opens nothing: it only says which allowance an
// attempt counts against.
export const deviceCookie = '__Host-mirador_device'

// Browsers keep a cookie for at most 400 days; each sign-in gives a new one.
const deviceLifetime = 365 * 24 * 60 * 60

export function deviceCookies(secret: string) {
  // Tied to the account, so a cookie from one account says nothing about another.
  const sign = (userId: string, nonce: string) =>
    steadyBytes(secret, `device:${userId}:${nonce}`, 32).toString('base64url')

  return {
    remember(c: Context, userId: string) {
      const nonce = randomToken()
      setCookie(c, deviceCookie, `${nonce}.${sign(userId, nonce)}`, {
        path: '/',
        httpOnly: true,
        sameSite: 'Strict',
        secure: true,
        maxAge: deviceLifetime,
      })
    },

    // This browser's own id when its cookie was given for this account, else null.
    known(c: Context, userId: string) {
      const [nonce, mac] = (getCookie(c, deviceCookie) ?? '').split('.')
      if (!nonce || !mac) return null
      return sameText(mac, sign(userId, nonce)) ? nonce : null
    },
  }
}

export type DeviceCookies = ReturnType<typeof deviceCookies>
