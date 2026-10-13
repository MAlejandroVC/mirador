import { z } from 'zod'

// Accounts and key material (SYS-06, SEC-02, SEC-03, SEC-07). Nothing here can decrypt
// anything: the server receives a login secret instead of the password, and the
// account key only wrapped by keys it never sees.

const base64Url = z.string().regex(/^[A-Za-z0-9_-]+$/)

// Base64url of 32 bytes: login secrets and recovery secrets.
export const secret = base64Url.length(43)

// Base64url of a 256-bit key wrapped with AES-KW (40 bytes).
export const wrappedKey = base64Url.length(54)

// The name a person signs in with. Not an email: the server sends no mail (NFR-05)
// and can't reset a password anyway (SEC-07), so it would only be personal data
// sitting on the server and in its backups.
export const usernamePattern = /^[a-z0-9._-]{3,32}$/
export const username = z.string().trim().toLowerCase().regex(usernamePattern)

// Argon2id settings, stored per user so they can be raised later. The browser
// refuses settings below its own minimum, whatever the server says (SEC-03).
export const kdfParams = z.object({
  algorithm: z.literal('argon2id'),
  salt: base64Url.min(22).max(88),
  memoryKiB: z.int().positive(),
  iterations: z.int().positive(),
  parallelism: z.int().positive(),
})
export type KdfParamsBody = z.infer<typeof kdfParams>

// GET /api/accounts/sign-up. Whether this server takes new accounts right now
// (SYS-13): `setup` before the first account exists, which needs the setup code from
// the server's log; `open` when the operator turned open sign-up on; `closed` otherwise.
export const signUpStatus = z.object({
  mode: z.enum(['setup', 'open', 'closed']),
})
export type SignUpStatus = z.infer<typeof signUpStatus>

// POST /api/accounts. Creates the account and signs it in.
export const signUpRequest = z.object({
  username,
  loginSecret: secret,
  kdf: kdfParams,
  wrappedAccountKey: z.object({
    password: wrappedKey,
    recovery: wrappedKey,
  }),
  recoverySecret: secret,
  setupCode: z.string().trim().max(64).optional(),
})
export type SignUpRequest = z.infer<typeof signUpRequest>

export const signUpError = z.object({
  error: z.enum(['sign-up-closed', 'wrong-setup-code', 'username-taken']),
})
export type SignUpError = z.infer<typeof signUpError>

// POST /api/accounts/prelogin. The salt and cost to derive the login secret with.
// An unknown username gets made-up settings that stay the same on every request,
// so this can't be used to find out who has an account.
export const preloginRequest = z.object({ username })
export const preloginResponse = z.object({ kdf: kdfParams })
export type PreloginResponse = z.infer<typeof preloginResponse>

// GET /api/keys. The signed-in user's key material, to unlock the app.
export const keysResponse = z.object({
  kdf: kdfParams,
  wrappedAccountKey: wrappedKey,
})
export type KeysResponse = z.infer<typeof keysResponse>

// SEC-07: a forgotten password. The browser proves it holds the recovery key with the
// recovery secret derived from it, gets the account key wrapped by the recovery key,
// and opens it there.
// POST /api/accounts/recovery/key
export const recoveryKeyRequest = z.object({ username, recoverySecret: secret })
export const recoveryKeyResponse = z.object({ wrappedAccountKey: wrappedKey })
export type RecoveryKeyResponse = z.infer<typeof recoveryKeyResponse>

// POST /api/accounts/recovery. Sets the new password's login secret, salt and wrapped
// key, signs every device out and signs this one in. The recovery key keeps working.
export const recoverRequest = z.object({
  username,
  recoverySecret: secret,
  loginSecret: secret,
  kdf: kdfParams,
  wrappedAccountKey: wrappedKey,
})
export type RecoverRequest = z.infer<typeof recoverRequest>

// POST /api/session. Signs in with the login secret, never the password (SEC-03).
export const signInRequest = z.object({ username, loginSecret: secret })
export type SignInRequest = z.infer<typeof signInRequest>

// GET /api/session. The signed-in user, or null.
export const sessionResponse = z
  .object({
    user: z.object({ id: z.string(), username: z.string() }),
  })
  .nullable()
export type SessionResponse = z.infer<typeof sessionResponse>

// What every sign-in route can refuse with, besides a malformed request (400).
// A wrong login secret and an unknown username get the same answer.
export const sessionError = z.object({
  error: z.enum(['wrong-credentials', 'wrong-recovery-key', 'too-many-attempts', 'signed-out']),
})
export type SessionError = z.infer<typeof sessionError>

// Any error body the server sends: a short code the app turns into words.
export const errorResponse = z.object({ error: z.string() })
