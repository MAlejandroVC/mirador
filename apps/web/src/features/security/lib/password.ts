// Rules for a new password (sign-up, recovery and changing it). Only the browser can
// check them: the server never sees the password (SEC-03). Existing passwords keep
// working; the rules apply when one is chosen.
export const minimumPasswordLength = 8

// Letters and numbers in any language count, so "ñ" is a lowercase letter and a space
// or "¿" is a symbol.
const rules = {
  lowercase: /\p{Ll}/u,
  uppercase: /\p{Lu}/u,
  number: /\p{N}/u,
  symbol: /[^\p{L}\p{N}]/u,
}

// Counted as people see characters, so an emoji or an accented letter is one.
const characters = new Intl.Segmenter()

// Each rule on its own, to tick them off while the password is typed.
export function passwordChecks(password: string) {
  return {
    length: [...characters.segment(password)].length >= minimumPasswordLength,
    uppercase: rules.uppercase.test(password),
    lowercase: rules.lowercase.test(password),
    number: rules.number.test(password),
    symbol: rules.symbol.test(password),
  }
}

export function passwordFollowsRules(password: string) {
  return Object.values(passwordChecks(password)).every(Boolean)
}
