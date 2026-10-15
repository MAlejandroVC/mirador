import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

// DL-CMP-06: a screen opened from Settings has a back button with Settings' title.
export function useSettingsBack() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return {
    label: t('nav.settings'),
    onClick: () => {
      void navigate({ to: '/settings' })
    },
  }
}
