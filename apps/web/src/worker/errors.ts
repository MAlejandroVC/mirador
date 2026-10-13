// Kept apart from the vault so the page can explain errors without loading the
// cryptography code, which only the worker needs.
export const vaultErrorCodes = [
  'wrong-credentials',
  'wrong-password',
  'username-taken',
  'sign-up-closed',
  'wrong-setup-code',
  'signed-out',
  'too-many-attempts',
  'unsafe-server',
  'network',
  'unknown',
] as const
export type VaultErrorCode = (typeof vaultErrorCodes)[number]

// The code travels as the message, which is what survives the trip from the worker.
export class VaultError extends Error {
  constructor(readonly code: VaultErrorCode) {
    super(code)
    this.name = 'VaultError'
  }
}

export function vaultErrorCode(error: unknown): VaultErrorCode {
  const message = error instanceof Error ? error.message : ''
  return vaultErrorCodes.find((code) => code === message) ?? 'unknown'
}
