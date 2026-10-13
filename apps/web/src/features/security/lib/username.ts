import { usernamePattern } from '@repo/api'

// The server's username rule (usernamePattern), split in two to tick off while typing.
// Usernames are kept in lower case and trimmed, so capitals and outer spaces are fine.
export function usernameChecks(username: string) {
  const name = username.trim().toLowerCase()
  return {
    length: name.length >= 3 && name.length <= 32,
    characters: name.length > 0 && /^[a-z0-9._-]+$/.test(name),
  }
}

export function usernameFollowsRules(username: string) {
  return usernamePattern.test(username.trim().toLowerCase())
}
