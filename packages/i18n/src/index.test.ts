import { describe, expect, it } from 'vitest'
import { languages, resources } from './index.ts'

// Lists every leaf key as a dotted path, e.g. "health.ok".
function keysOf(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix]
  return Object.entries(value).flatMap(([key, child]) =>
    keysOf(child, prefix ? `${prefix}.${key}` : key),
  )
}

describe('SYS-10 translations', () => {
  it('SYS-10: every language has the same namespaces', () => {
    const namespaces = languages.map((language) => Object.keys(resources[language]).sort())
    for (const list of namespaces) expect(list).toEqual(namespaces[0])
  })

  it('SYS-10: every key exists in English and Spanish', () => {
    for (const namespace of Object.keys(resources.en) as (keyof typeof resources.en)[]) {
      const english = keysOf(resources.en[namespace]).sort()
      for (const language of languages) {
        expect(keysOf(resources[language][namespace]).sort(), `${language}/${namespace}`).toEqual(
          english,
        )
      }
    }
  })
})
