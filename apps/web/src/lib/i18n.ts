import { defaultNamespace, resources } from '@repo/i18n'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { readLanguageChoice, resolveLanguage } from './language'

// Screen readers and the browser's spell checking follow the page language.
i18n.on('languageChanged', (language) => {
  document.documentElement.lang = language
})

// SYS-19: the language chosen in Settings, or the device's (SYS-10).
void i18n.use(initReactI18next).init({
  resources,
  lng: resolveLanguage(readLanguageChoice()),
  fallbackLng: 'en',
  defaultNS: defaultNamespace,
  interpolation: { escapeValue: false },
})

// On Automatic, follow the device when its language changes while the app is open.
globalThis.addEventListener('languagechange', () => {
  if (readLanguageChoice() === 'automatic') void i18n.changeLanguage(resolveLanguage('automatic'))
})

export default i18n
