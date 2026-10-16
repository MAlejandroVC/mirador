import { useTranslation } from 'react-i18next'
import { useBack } from './back'

// DL-CMP-06: a screen opened from Settings has a back button with Settings' title.
export function useSettingsBack() {
  const { t } = useTranslation()
  return useBack(t('nav.settings'), { to: '/settings' })
}
