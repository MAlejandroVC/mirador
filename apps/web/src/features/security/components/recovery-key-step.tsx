import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert } from '../../../components/ui/alert'
import { Button } from '../../../components/ui/button'
import { AuthLayout } from './auth-layout'

interface RecoveryKeyStepProps {
  email: string
  recoveryKey: string
  onDone: () => Promise<void>
}

// SEC-07: the recovery key is shown once, with a way to copy or download it, and the
// warning that losing both it and the password loses the data.
export function RecoveryKeyStep({ email, recoveryKey, onDone }: RecoveryKeyStepProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const groups = recoveryKey.split('-')

  async function copy() {
    await navigator.clipboard.writeText(recoveryKey)
    setCopied(true)
  }

  function download() {
    const file = new Blob([t('security.recoveryKey.fileText', { email, key: recoveryKey })], {
      type: 'text/plain',
    })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(file)
    link.download = t('security.recoveryKey.fileName')
    link.click()
    URL.revokeObjectURL(link.href)
  }

  return (
    <AuthLayout title={t('security.recoveryKey.title')} intro={t('security.recoveryKey.intro')}>
      <figure className="flex flex-col gap-2">
        <figcaption className="text-sm font-medium text-slate-800">
          {t('security.recoveryKey.label')}
        </figcaption>
        <p
          aria-label={recoveryKey}
          className="grid grid-cols-4 gap-x-3 gap-y-1 rounded-lg border border-slate-300 bg-slate-100 p-4 font-mono text-lg tracking-wider text-slate-900 select-all sm:grid-cols-5"
        >
          {groups.map((group, index) => (
            <span key={index}>{group}</span>
          ))}
        </p>
      </figure>
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="secondary"
          onClick={() => {
            void copy()
          }}
        >
          <span aria-live="polite">
            {copied ? t('security.recoveryKey.copied') : t('security.recoveryKey.copy')}
          </span>
        </Button>
        <Button variant="secondary" onClick={download}>
          {t('security.recoveryKey.download')}
        </Button>
      </div>
      <Alert tone="warning">{t('security.recoveryKey.warning')}</Alert>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-slate-800">
        <input
          type="checkbox"
          className="size-5 accent-slate-900"
          checked={saved}
          onChange={(event) => {
            setSaved(event.target.checked)
          }}
        />
        {t('security.recoveryKey.confirm')}
      </label>
      <Button
        disabled={!saved || leaving}
        onClick={() => {
          setLeaving(true)
          void onDone()
        }}
      >
        {t('security.recoveryKey.continue')}
      </Button>
    </AuthLayout>
  )
}
