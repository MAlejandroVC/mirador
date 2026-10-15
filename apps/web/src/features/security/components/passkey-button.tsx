import { useMutation } from '@tanstack/react-query'
import { Button } from '../../../components/ui/button'
import { type VaultErrorCode, vaultErrorCode } from '../../../worker/errors'
import { openWithPasskey } from '../hooks/passkeys'
import { useVault } from '../hooks/vault'
import { ErrorMessage } from './error-message'

// SYS-06, SEC-12: signs in or unlocks with Face ID, a fingerprint or the device's PIN.
// Only on a tap: Safari asks for a passkey only in answer to one.
export function PasskeyButton({
  label,
  working,
  variant = 'primary',
  onOpened,
  onError,
}: {
  label: string
  working: string
  variant?: 'primary' | 'secondary'
  onOpened: () => Promise<void>
  onError?: (code: VaultErrorCode) => Promise<void>
}) {
  const vault = useVault()
  const open = useMutation({
    mutationFn: () => openWithPasskey(vault),
    onSuccess: onOpened,
    onError: (error) => onError?.(vaultErrorCode(error)),
  })

  return (
    <div className="flex flex-col gap-4">
      <ErrorMessage code={open.isError ? vaultErrorCode(open.error) : null} />
      <Button
        variant={variant}
        disabled={open.isPending}
        onClick={() => {
          open.mutate()
        }}
      >
        {open.isPending ? working : label}
      </Button>
    </div>
  )
}

export function OrDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-text-muted" role="separator">
      <span className="h-px flex-1 bg-separator" />
      {label}
      <span className="h-px flex-1 bg-separator" />
    </div>
  )
}
