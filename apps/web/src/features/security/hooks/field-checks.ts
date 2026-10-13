import { useTranslation } from 'react-i18next'
import type { FieldCheck } from '../../../components/ui/text-field'
import { minimumPasswordLength, passwordChecks } from '../lib/password'
import { usernameChecks } from '../lib/username'

// The checklists shown under a field while it is being filled in (SYS-06).

export function usePasswordChecks(password: string): FieldCheck[] {
  const { t } = useTranslation()
  const met = passwordChecks(password)
  return [
    { label: t('security.checks.length', { count: minimumPasswordLength }), met: met.length },
    { label: t('security.checks.uppercase'), met: met.uppercase },
    { label: t('security.checks.lowercase'), met: met.lowercase },
    { label: t('security.checks.number'), met: met.number },
    { label: t('security.checks.symbol'), met: met.symbol },
  ]
}

export function useRepeatChecks(password: string, repeat: string): FieldCheck[] {
  const { t } = useTranslation()
  return [{ label: t('security.checks.matches'), met: repeat !== '' && repeat === password }]
}

export function useUsernameChecks(username: string): FieldCheck[] {
  const { t } = useTranslation()
  const met = usernameChecks(username)
  return [
    { label: t('security.checks.usernameLength'), met: met.length },
    { label: t('security.checks.usernameCharacters'), met: met.characters },
  ]
}
