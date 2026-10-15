import { languages } from '@repo/i18n'

// SYS-19: the app's language, chosen per device under Settings > Language. Automatic
// follows the device's language, so it is the default. Like the appearance (SYS-16) it
// lives in this browser's storage, so sign-in already speaks it; it is a setting, not
// user data.

export type Language = (typeof languages)[number]

/** The choices in the order Settings shows them. */
export const languageChoices = ['automatic', 'es', 'en'] as const

export type LanguageChoice = (typeof languageChoices)[number]

/** Each language's name in that language, as iOS lists them, so anyone can find their own. */
export const nativeNames: Record<Language, string> = { en: 'English', es: 'Español' }

const storageKey = 'mirador.language'

function isLanguageChoice(value: unknown): value is LanguageChoice {
  return languageChoices.includes(value as LanguageChoice)
}

export function readLanguageChoice(): LanguageChoice {
  try {
    const stored = localStorage.getItem(storageKey)
    if (isLanguageChoice(stored)) return stored
  } catch {
    // Storage blocked: follow the device.
  }
  return 'automatic'
}

export function saveLanguageChoice(choice: LanguageChoice) {
  try {
    localStorage.setItem(storageKey, choice)
  } catch {
    // Still applied for this visit.
  }
}

/** SYS-10: the device's language when Mirador has it, English otherwise. */
export function deviceLanguage(): Language {
  for (const tag of globalThis.navigator.languages.length > 0
    ? globalThis.navigator.languages
    : [globalThis.navigator.language]) {
    const match = languages.find((language) => language === tag.slice(0, 2).toLowerCase())
    if (match) return match
  }
  return 'en'
}

export function resolveLanguage(choice: LanguageChoice): Language {
  return choice === 'automatic' ? deviceLanguage() : choice
}
