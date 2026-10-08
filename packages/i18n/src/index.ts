// Translations. Every key exists in both en/ and es/ (SYS-10); the test next to
// this file fails when one language is missing a key.
import enCommon from '../en/common.json'
import esCommon from '../es/common.json'

export const languages = ['en', 'es'] as const
export type Language = (typeof languages)[number]

export const defaultNamespace = 'common'

export const resources = {
  en: { common: enCommon },
  es: { common: esCommon },
} as const satisfies Record<Language, Record<string, unknown>>
