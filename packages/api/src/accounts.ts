import { z } from 'zod'

// Accounts and key material (SYS-06, SEC-02, SEC-03, SEC-07). Nothing here can decrypt
// anything: the server receives a login secret instead of the password, and the
// account key only wrapped by keys it never sees.

const base64Url = z.string().regex(/^[A-Za-z0-9_-]+$/)

// Base64url of 32 bytes: login secrets and recovery secrets.
export const secret = base64Url.length(43)

// Base64url of a 256-bit key wrapped with AES-KW (40 bytes).
export const wrappedKey = base64Url.length(54)

export const email = z.string().trim().toLowerCase().pipe(z.email().max(254))

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
  email,
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
  error: z.enum(['sign-up-closed', 'wrong-setup-code', 'email-taken']),
})
export type SignUpError = z.infer<typeof signUpError>

// POST /api/accounts/prelogin. The salt and cost to derive the login secret with.
// An unknown email gets made-up settings that stay the same on every request, so
// this can't be used to find out who has an account.
export const preloginRequest = z.object({ email })
export const preloginResponse = z.object({ kdf: kdfParams })
export type PreloginResponse = z.infer<typeof preloginResponse>

// GET /api/keys. The signed-in user's key material, to unlock the app.
export const keysResponse = z.object({
  kdf: kdfParams,
  wrappedAccountKey: wrappedKey,
})
export type KeysResponse = z.infer<typeof keysResponse>

// GET /api/auth/get-session (Better Auth). Only the fields the app reads.
export const sessionResponse = z
  .object({
    user: z.object({ id: z.string(), email: z.string() }),
  })
  .nullable()
export type SessionResponse = z.infer<typeof sessionResponse>
