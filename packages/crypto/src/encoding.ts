// Byte encodings for values that travel as text: base64url for key material sent to
// the server, Crockford base32 for the recovery key a person writes down.

export function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error('Not base64url')
  const base64 = text.replaceAll('-', '+').replaceAll('_', '/')
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

// Crockford's alphabet leaves out I, L, O and U, so a key copied by hand can't
// confuse 1 with I or 0 with O.
const base32Alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export function toBase32(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let text = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      text += base32Alphabet.charAt((value >>> (bits - 5)) & 31)
      bits -= 5
    }
  }
  if (bits > 0) text += base32Alphabet.charAt((value << (5 - bits)) & 31)
  return text
}

// Reads what a person typed: any case, with or without spaces and dashes, and the
// look-alike letters Crockford maps to digits.
export function fromBase32(text: string, byteLength: number): Uint8Array<ArrayBuffer> {
  const clean = text.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0')
  const bytes = new Uint8Array(byteLength)
  let bits = 0
  let value = 0
  let index = 0
  for (const char of clean) {
    const digit = base32Alphabet.indexOf(char)
    if (digit < 0) throw new Error('Not base32')
    value = ((value << 5) | digit) & 0xffff
    bits += 5
    if (bits >= 8) {
      if (index >= byteLength) throw new Error('Too long')
      bytes[index++] = (value >>> (bits - 8)) & 255
      bits -= 8
    }
  }
  if (index !== byteLength) throw new Error('Too short')
  return bytes
}

export function utf8(text: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(text)
}
