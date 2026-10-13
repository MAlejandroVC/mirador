import type { AuthenticationResponse, RegistrationResponse } from '@repo/api'
import {
  type AuthenticatorTransport,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import { isoBase64URL } from '@simplewebauthn/server/helpers'

// SYS-06: the server's half of passkeys, kept in this one file like secrets.ts.
// @simplewebauthn/server checks every signature, origin, challenge and flag; this file
// only fixes the settings Mirador needs and turns the results into plain values.

// The site a passkey belongs to. Taken from the page that asked (its Origin, which
// sameOrigin has already matched to the host), so each server, preview included, has
// its own passkeys and nothing needs configuring.
export interface RelyingParty {
  id: string
  origin: string
}

export interface StoredPasskey {
  id: string
  publicKey: string
  counter: number
  transports: string[]
}

const timeout = 5 * 60 * 1000

export function relyingParty(origin: string | undefined): RelyingParty | null {
  if (!origin) return null
  try {
    const url = new URL(origin)
    return { id: url.hostname, origin: url.origin }
  } catch {
    return null
  }
}

// A passkey must check who is holding the device (Face ID, a fingerprint or its PIN)
// and be discoverable, so it can sign in without typing a username.
export async function registrationOptions(
  rp: RelyingParty,
  user: { id: string; username: string },
  existing: StoredPasskey[],
) {
  const options = await generateRegistrationOptions({
    rpName: 'Mirador',
    rpID: rp.id,
    userID: new TextEncoder().encode(user.id),
    userName: user.username,
    userDisplayName: user.username,
    timeout,
    attestationType: 'none',
    excludeCredentials: existing.map(({ id, transports }) => ({
      id,
      transports: asTransports(transports),
    })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
  })
  return { challenge: options.challenge, options }
}

export async function verifyRegistration(
  rp: RelyingParty,
  challenge: string,
  response: RegistrationResponse,
): Promise<StoredPasskey | null> {
  try {
    const { verified, registrationInfo } = await verifyRegistrationResponse({
      response: {
        ...response,
        response: { ...response.response, transports: asTransports(response.response.transports) },
      },
      expectedChallenge: challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      requireUserVerification: true,
    })
    if (!verified) return null
    const { credential } = registrationInfo
    return {
      id: credential.id,
      publicKey: isoBase64URL.fromBuffer(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? [],
    }
  } catch {
    return null
  }
}

// Signed out, any of this site's passkeys may answer; unlocking, only the user's own.
export async function signInOptions(rp: RelyingParty, allowed: StoredPasskey[] | null) {
  const options = await generateAuthenticationOptions({
    rpID: rp.id,
    timeout,
    userVerification: 'required',
    ...(allowed
      ? {
          allowCredentials: allowed.map(({ id, transports }) => ({
            id,
            transports: asTransports(transports),
          })),
        }
      : {}),
  })
  return { challenge: options.challenge, options }
}

// The passkey's new signature counter, or null when the answer doesn't check out.
export async function verifySignIn(
  rp: RelyingParty,
  challenge: string,
  response: AuthenticationResponse,
  passkey: StoredPasskey,
): Promise<{ counter: number } | null> {
  try {
    const { verified, authenticationInfo } = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      credential: {
        id: passkey.id,
        publicKey: isoBase64URL.toBuffer(passkey.publicKey),
        counter: passkey.counter,
        transports: asTransports(passkey.transports),
      },
      requireUserVerification: true,
    })
    return verified ? { counter: authenticationInfo.newCounter } : null
  } catch {
    // Includes a counter that went backwards, the sign of a copied passkey.
    return null
  }
}

function asTransports(transports: string[] | undefined) {
  return transports as AuthenticatorTransport[] | undefined
}
