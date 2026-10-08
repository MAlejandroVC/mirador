import { defaultNamespace, languages, resources } from '@repo/i18n'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

// Picks Spanish when the browser prefers it, English otherwise (SYS-10).
// A language setting arrives with the settings screen.
function preferredLanguage() {
  const browser = globalThis.navigator.language.slice(0, 2)
  return languages.find((language) => language === browser) ?? 'en'
}

// Screen readers and the browser's spell checking follow the page language.
i18n.on('languageChanged', (language) => {
  document.documentElement.lang = language
})

void i18n.use(initReactI18next).init({
  resources,
  lng: preferredLanguage(),
  fallbackLng: 'en',
  defaultNS: defaultNamespace,
  interpolation: { escapeValue: false },
})

export default i18n
