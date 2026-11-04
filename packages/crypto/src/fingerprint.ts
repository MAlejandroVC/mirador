// IMP-36: a file's SHA-256, so importing the same file twice can be caught. It is kept
// only inside the import's encrypted record (SEC-01).
export async function fileFingerprint(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
