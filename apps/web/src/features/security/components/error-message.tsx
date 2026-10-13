import { useTranslation } from 'react-i18next'
import { Alert } from '../../../components/ui/alert'
import type { VaultErrorCode } from '../../../worker/errors'

export function ErrorMessage({ code }: { code: VaultErrorCode | null }) {
  const { t } = useTranslation()
  if (!code) return null
  return <Alert>{t(`security.errors.${code}`)}</Alert>
}
