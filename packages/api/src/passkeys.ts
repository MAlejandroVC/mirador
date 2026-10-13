import { z } from 'zod'
import { secret, wrappedKey } from './accounts.ts'

// SYS-06, SEC-12: passkeys sign in and unlock without the password. Each passkey must
// support the WebAuthn PRF extension: the secret it returns wraps the account key in
// the browser, and the server stores only that wrapped key, never the secret.

// What every passkey is asked to turn into its secret. Public by design: the secret
// depends on the passkey, which never leaves the device.
export const passkeyPrfInput = 'mirador passkey unlock v1'

const base64Url = z.string().regex(/^[A-Za-z0-9_-]*$/)

// The WebAuthn JSON shapes the browser and server pass back and forth. Only the fields
// Mirador uses are checked; the browser and @simplewebauthn/server check the rest.
const credentialDescriptor = z.object({
  id: base64Url,
  type: z.string(),
  transports: z.array(z.string()).optional(),
})

export const creationOptions = z.object({
  challenge: base64Url,
  rp: z.object({ id: z.string().optional(), name: z.string() }),
  user: z.object({ id: base64Url, name: z.string(), displayName: z.string() }),
  pubKeyCredParams: z.array(z.object({ type: z.string(), alg: z.number() })),
  timeout: z.number().optional(),
  excludeCredentials: z.array(credentialDescriptor).optional(),
  authenticatorSelection: z
    .object({
      authenticatorAttachment: z.enum(['platform', 'cross-platform']).optional(),
      residentKey: z.enum(['discouraged', 'preferred', 'required']).optional(),
      requireResidentKey: z.boolean().optional(),
      userVerification: z.enum(['discouraged', 'preferred', 'required']).optional(),
    })
    .optional(),
  attestation: z.enum(['none', 'indirect', 'direct', 'enterprise']).optional(),
})
export type CreationOptions = z.infer<typeof creationOptions>

export const requestOptions = z.object({
  challenge: base64Url,
  rpId: z.string().optional(),
  allowCredentials: z.array(credentialDescriptor).optional(),
  timeout: z.number().optional(),
  userVerification: z.enum(['discouraged', 'preferred', 'required']).optional(),
})
export type RequestOptions = z.infer<typeof requestOptions>

// The browser never puts the PRF secret in here: clientExtensionResults stays empty.
export const registrationResponse = z.object({
  id: base64Url,
  rawId: base64Url,
  type: z.literal('public-key'),
  response: z.object({
    clientDataJSON: base64Url,
    attestationObject: base64Url,
    transports: z.array(z.string()).optional(),
  }),
  clientExtensionResults: z.object({}).strict(),
  authenticatorAttachment: z.enum(['platform', 'cross-platform']).optional(),
})
export type RegistrationResponse = z.infer<typeof registrationResponse>

export const authenticationResponse = z.object({
  id: base64Url,
  rawId: base64Url,
  type: z.literal('public-key'),
  response: z.object({
    clientDataJSON: base64Url,
    authenticatorData: base64Url,
    signature: base64Url,
    userHandle: base64Url.optional(),
  }),
  clientExtensionResults: z.object({}).strict(),
  authenticatorAttachment: z.enum(['platform', 'cross-platform']).optional(),
})
export type AuthenticationResponse = z.infer<typeof authenticationResponse>

// POST /api/passkeys/registration (signed in). Options for creating a passkey; the
// challenge is kept on the server under challengeId for a few minutes.
export const registrationOptionsResponse = z.object({
  challengeId: z.string(),
  options: creationOptions,
})
export type RegistrationOptionsResponse = z.infer<typeof registrationOptionsResponse>

// POST /api/passkeys (signed in). Saves the passkey with the account key wrapped by its
// secret. Like changing the password, it needs the current password's login secret.
export const addPasskeyRequest = z.object({
  challengeId: z.string(),
  response: registrationResponse,
  loginSecret: secret,
  wrappedAccountKey: wrappedKey,
})
export type AddPasskeyRequest = z.infer<typeof addPasskeyRequest>

// GET /api/passkeys (signed in): the user's passkeys. DELETE /api/passkeys/:id removes one.
export const passkey = z.object({
  id: z.string(),
  createdAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime().nullable(),
})
export type Passkey = z.infer<typeof passkey>
export const passkeysResponse = z.object({ passkeys: z.array(passkey) })
export type PasskeysResponse = z.infer<typeof passkeysResponse>

// POST /api/passkeys/sign-in/options. Signed out, any passkey for this server will do;
// signed in (unlocking), only the user's own.
export const signInOptionsResponse = z.object({
  challengeId: z.string(),
  options: requestOptions,
})
export type SignInOptionsResponse = z.infer<typeof signInOptionsResponse>

// POST /api/passkeys/sign-in. Checks the passkey, signs this device in, and returns
// the account key wrapped by that passkey's secret.
export const passkeySignInRequest = z.object({
  challengeId: z.string(),
  response: authenticationResponse,
})
export type PasskeySignInRequest = z.infer<typeof passkeySignInRequest>
export const passkeySignInResponse = z.object({ wrappedAccountKey: wrappedKey })
export type PasskeySignInResponse = z.infer<typeof passkeySignInResponse>

// A person rarely has more than a few devices; the cap only stops a script filling
// the table.
export const maxPasskeys = 20

// What the passkey routes refuse with, besides the sign-in errors (SessionError). A
// passkey that doesn't check out, an expired challenge and an unknown passkey all get
// wrong-passkey.
export const passkeyError = z.object({
  error: z.enum(['wrong-passkey', 'too-many-passkeys']),
})
export type PasskeyError = z.infer<typeof passkeyError>
