import {
  type AuthenticationResponse,
  type CreationOptions,
  passkeyPrfInput,
  type RegistrationResponse,
  type RequestOptions,
} from '@repo/api'
import { VaultError } from '../../../worker/errors'

// SYS-06: the browser's half of passkeys. WebAuthn only works on the page, not in the
// worker, so this asks the device for the passkey (Face ID, a fingerprint or its PIN)
// and hands the worker the passkey's PRF secret, which never goes to the server.

export interface PasskeyResult<Response> {
  response: Response
  prfOutput: Uint8Array
}

const prfInput = new TextEncoder().encode(passkeyPrfInput)
const prf = { eval: { first: prfInput } }

export function passkeysSupported() {
  return typeof window !== 'undefined' && 'PublicKeyCredential' in window
}

// Makes a passkey and gets its PRF secret. A passkey without PRF can't unlock the data,
// so it is refused here rather than saved.
export async function createPasskey(
  options: CreationOptions,
): Promise<PasskeyResult<RegistrationResponse>> {
  const credential = await ask(() =>
    navigator.credentials.create({
      publicKey: {
        ...options,
        challenge: fromBase64Url(options.challenge),
        user: { ...options.user, id: fromBase64Url(options.user.id) },
        pubKeyCredParams: options.pubKeyCredParams.map(({ alg }) => ({ type: 'public-key', alg })),
        excludeCredentials: options.excludeCredentials?.map(descriptor),
        attestation: 'none',
        extensions: { prf },
      },
    }),
  )
  const attestation = credential.response as AuthenticatorAttestationResponse
  const results = credential.getClientExtensionResults().prf
  let prfOutput = results?.results?.first
  // Some passkeys only give their PRF secret when used, not when made: one more ask.
  if (!prfOutput && results?.enabled) {
    const used = await ask(() =>
      navigator.credentials.get({
        publicKey: {
          // Only the PRF secret is wanted here; nothing checks this signature.
          challenge: new TextEncoder().encode(`mirador prf ${Date.now()}`),
          rpId: options.rp.id,
          allowCredentials: [{ type: 'public-key', id: credential.rawId }],
          userVerification: 'required',
          extensions: { prf },
        },
      }),
    )
    prfOutput = used.getClientExtensionResults().prf?.results?.first
  }
  if (!prfOutput) {
    await forget(credential.id, options.rp.id)
    throw new VaultError('passkey-unsupported')
  }
  return {
    response: {
      id: credential.id,
      rawId: toBase64Url(credential.rawId),
      type: 'public-key',
      response: {
        clientDataJSON: toBase64Url(attestation.clientDataJSON),
        attestationObject: toBase64Url(attestation.attestationObject),
        transports: attestation.getTransports(),
      },
      // SEC-04: never the PRF results.
      clientExtensionResults: {},
      ...attachment(credential),
    },
    prfOutput: bytes(prfOutput),
  }
}

// Uses a passkey to sign in or unlock, with its PRF secret.
export async function getPasskey(
  options: RequestOptions,
): Promise<PasskeyResult<AuthenticationResponse>> {
  const credential = await ask(() =>
    navigator.credentials.get({
      publicKey: {
        ...options,
        challenge: fromBase64Url(options.challenge),
        allowCredentials: options.allowCredentials?.map(descriptor),
        extensions: { prf },
      },
    }),
  )
  const assertion = credential.response as AuthenticatorAssertionResponse
  const prfOutput = credential.getClientExtensionResults().prf?.results?.first
  if (!prfOutput) throw new VaultError('passkey-unsupported')
  return {
    response: {
      id: credential.id,
      rawId: toBase64Url(credential.rawId),
      type: 'public-key',
      response: {
        clientDataJSON: toBase64Url(assertion.clientDataJSON),
        authenticatorData: toBase64Url(assertion.authenticatorData),
        signature: toBase64Url(assertion.signature),
        ...(assertion.userHandle ? { userHandle: toBase64Url(assertion.userHandle) } : {}),
      },
      clientExtensionResults: {},
      ...attachment(credential),
    },
    prfOutput: bytes(prfOutput),
  }
}

// Closing the prompt, or a device that has no passkey for this site, both end here.
async function ask(request: () => Promise<Credential | null>) {
  let credential: Credential | null
  try {
    credential = await request()
  } catch (error) {
    if (error instanceof DOMException && ['NotAllowedError', 'AbortError'].includes(error.name)) {
      throw new VaultError('passkey-cancelled')
    }
    if (error instanceof DOMException && error.name === 'InvalidStateError') {
      // This device already has a passkey for this account.
      throw new VaultError('passkey-cancelled')
    }
    throw new VaultError('passkey-unsupported')
  }
  if (!(credential instanceof PublicKeyCredential)) throw new VaultError('passkey-cancelled')
  return credential
}

// Asks the device to drop a passkey the server never saved, where browsers allow it.
async function forget(credentialId: string, rpId: string | undefined) {
  const signal = (
    PublicKeyCredential as unknown as {
      signalUnknownCredential?: (options: { rpId: string; credentialId: string }) => Promise<void>
    }
  ).signalUnknownCredential
  if (!signal) return
  await signal({ rpId: rpId ?? location.hostname, credentialId }).catch(() => undefined)
}

// After a new username, asks the device to show it on this account's passkeys, where
// browsers allow it. The passkeys work either way: they are tied to the account's id.
export async function renamePasskeys(userId: string, username: string) {
  if (!passkeysSupported()) return
  const signal = (
    PublicKeyCredential as unknown as {
      signalCurrentUserDetails?: (options: {
        rpId: string
        userId: string
        name: string
        displayName: string
      }) => Promise<void>
    }
  ).signalCurrentUserDetails
  if (!signal) return
  await signal({
    rpId: location.hostname,
    // The same user handle the server gives the passkey: the id's UTF-8 bytes.
    userId: toBase64Url(new TextEncoder().encode(userId).buffer),
    name: username,
    displayName: username,
  }).catch(() => undefined)
}

function descriptor({ id, transports }: { id: string; transports?: string[] }) {
  return {
    type: 'public-key' as const,
    id: fromBase64Url(id),
    ...(transports ? { transports: transports as AuthenticatorTransport[] } : {}),
  }
}

function attachment(credential: PublicKeyCredential): {
  authenticatorAttachment?: 'platform' | 'cross-platform'
} {
  const value = credential.authenticatorAttachment
  return value === 'platform' || value === 'cross-platform'
    ? { authenticatorAttachment: value }
    : {}
}

function bytes(source: BufferSource) {
  return source instanceof ArrayBuffer
    ? new Uint8Array(source)
    : new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
}

function toBase64Url(buffer: ArrayBuffer) {
  let binary = ''
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string) {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) out[index] = binary.charCodeAt(index)
  return out
}
