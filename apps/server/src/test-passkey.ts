import type { AuthenticationResponse, RegistrationResponse } from '@repo/api'
import { isoBase64URL, isoCBOR } from '@simplewebauthn/server/helpers'
import { testOrigin } from './test-app.ts'

// A passkey for tests: what a phone's authenticator does, in WebCrypto. It signs like
// a real one (ES256, "none" attestation), so the server's checks run for real.

const subtle = globalThis.crypto.subtle
const flags = { userPresent: 0x01, userVerified: 0x04, attestedData: 0x40 }

export interface Ceremony {
  challenge: string
  origin?: string
  rpId?: string
  // A passkey that skipped Face ID, a fingerprint or the PIN.
  unverified?: boolean
}

export async function fakePasskey() {
  const keys = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])
  const rawId = globalThis.crypto.getRandomValues(new Uint8Array(16))
  const id = isoBase64URL.fromBuffer(rawId)
  let counter = 0

  function clientData(type: string, { challenge, origin = testOrigin }: Ceremony) {
    return new TextEncoder().encode(JSON.stringify({ type, challenge, origin, crossOrigin: false }))
  }

  async function authenticatorData(ceremony: Ceremony, extra: number, tail = new Uint8Array()) {
    const rpIdHash = await sha256(new TextEncoder().encode(ceremony.rpId ?? 'localhost'))
    const flagByte = flags.userPresent | (ceremony.unverified ? 0 : flags.userVerified) | extra
    const count = new Uint8Array(4)
    new DataView(count.buffer).setUint32(0, counter)
    return concat(rpIdHash, Uint8Array.of(flagByte), count, tail)
  }

  return {
    id,

    async register(ceremony: Ceremony): Promise<RegistrationResponse> {
      const jwk = await subtle.exportKey('jwk', keys.publicKey)
      const publicKey = isoCBOR.encode(
        new Map<number, number | Uint8Array>([
          [1, 2],
          [3, -7],
          [-1, 1],
          [-2, isoBase64URL.toBuffer(jwk.x ?? '')],
          [-3, isoBase64URL.toBuffer(jwk.y ?? '')],
        ]),
      )
      const idLength = new Uint8Array(2)
      new DataView(idLength.buffer).setUint16(0, rawId.length)
      const authData = await authenticatorData(
        ceremony,
        flags.attestedData,
        concat(new Uint8Array(16), idLength, rawId, publicKey),
      )
      const attestationObject = isoCBOR.encode(
        new Map<string, string | Uint8Array | Map<string, never>>([
          ['fmt', 'none'],
          ['attStmt', new Map<string, never>()],
          ['authData', authData],
        ]),
      )
      return {
        id,
        rawId: id,
        type: 'public-key',
        response: {
          clientDataJSON: isoBase64URL.fromBuffer(clientData('webauthn.create', ceremony)),
          attestationObject: isoBase64URL.fromBuffer(attestationObject),
          transports: ['internal'],
        },
        clientExtensionResults: {},
      }
    },

    async signIn(ceremony: Ceremony): Promise<AuthenticationResponse> {
      counter += 1
      const authData = await authenticatorData(ceremony, 0)
      const data = clientData('webauthn.get', ceremony)
      const signed = concat(authData, await sha256(data))
      const signature = new Uint8Array(
        await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey, signed),
      )
      return {
        id,
        rawId: id,
        type: 'public-key',
        response: {
          clientDataJSON: isoBase64URL.fromBuffer(data),
          authenticatorData: isoBase64URL.fromBuffer(authData),
          signature: isoBase64URL.fromBuffer(derSignature(signature)),
        },
        clientExtensionResults: {},
      }
    },

    // A copy of the passkey replaying an old counter.
    rewind() {
      counter = 0
    },
  }
}

export type FakePasskey = Awaited<ReturnType<typeof fakePasskey>>

async function sha256(data: Uint8Array) {
  return new Uint8Array(await subtle.digest('SHA-256', new Uint8Array(data)))
}

function concat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((length, part) => length + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

// WebCrypto signs ECDSA as r and s side by side; WebAuthn sends them DER-encoded.
function derSignature(raw: Uint8Array) {
  const integer = (bytes: Uint8Array) => {
    let start = 0
    while (start < bytes.length - 1 && bytes[start] === 0) start += 1
    const trimmed = bytes.slice(start)
    const value = (trimmed[0] ?? 0) & 0x80 ? concat(Uint8Array.of(0), trimmed) : trimmed
    return concat(Uint8Array.of(0x02, value.length), value)
  }
  const body = concat(integer(raw.slice(0, 32)), integer(raw.slice(32)))
  return concat(Uint8Array.of(0x30, body.length), body)
}
