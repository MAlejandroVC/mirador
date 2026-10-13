import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  scrypt,
  timingSafeEqual,
} from 'node:crypto'

// The server's only cryptography: hashing what the browser sends to sign in, and
// making random ids, tokens and codes. None of it touches user data, which the server
// can't read anyway; that cryptography lives in @repo/crypto, in the browser (SEC-13).

// What the browser sends to sign in is 256 random bits (SEC-03), which no one can
// guess, so a slow hash isn't what protects it. scrypt is here anyway, in case a
// login secret ever turns out weaker than designed.
const cost = { N: 2 ** 14, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const keyLength = 32

function derive(secret: string, salt: Buffer, params = cost) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(secret, salt, keyLength, params, (error, key) => {
      if (error) reject(error)
      else resolve(key)
    })
  })
}

export async function hashSecret(secret: string) {
  const salt = randomBytes(16)
  const key = await derive(secret, salt)
  return [
    'scrypt',
    cost.N,
    cost.r,
    cost.p,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$')
}

export async function verifySecret(secret: string, stored: string) {
  const [algorithm, N, r, p, salt, key] = stored.split('$')
  if (algorithm !== 'scrypt' || !salt || !key) return false
  const expected = Buffer.from(key, 'base64url')
  const actual = await derive(secret, Buffer.from(salt, 'base64url'), {
    ...cost,
    N: Number(N),
    r: Number(r),
    p: Number(p),
  })
  return timingSafeEqual(actual, expected)
}

// Run for an unknown username, so refusing it takes as long as a wrong secret and the
// timing doesn't tell who has an account.
let decoy: Promise<string> | undefined
export async function verifyAgainstDecoy(secret: string) {
  decoy ??= hashSecret(randomToken())
  await verifySecret(secret, await decoy)
  return false
}

export function randomToken() {
  return randomBytes(32).toString('base64url')
}

// Session tokens are kept only as this hash, so a copy of the database can't be
// used to sign in.
export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('base64url')
}

// Compares in constant time, whatever the lengths.
export function sameText(a: string, b: string) {
  return timingSafeEqual(
    createHash('sha256').update(a).digest(),
    createHash('sha256').update(b).digest(),
  )
}

// Bytes that are the same every time for the same label and server secret.
export function steadyBytes(serverSecret: string, label: string, length: number) {
  return createHmac('sha256', serverSecret).update(label).digest().subarray(0, length)
}

export function randomCode(length: number, alphabet: string) {
  return Array.from({ length }, () => alphabet.charAt(randomInt(alphabet.length))).join('')
}
