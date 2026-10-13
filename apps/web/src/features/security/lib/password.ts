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

export function passwordFollowsRules(password: string) {
  return (
    [...characters.segment(password)].length >= minimumPasswordLength &&
    Object.values(rules).every((rule) => rule.test(password))
  )
}
