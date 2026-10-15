import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsBack } from '../../../components/shell/settings-back'
import { ChoiceRow } from '../../../components/ui/choice-row'
import { IconTile } from '../../../components/ui/icon-tile'
import { TranslateIcon } from '../../../components/ui/icons'
import { List } from '../../../components/ui/list'
import { Page } from '../../../components/ui/page'
import {
  deviceLanguage,
  type LanguageChoice,
  languageChoices,
  nativeNames,
  readLanguageChoice,
  resolveLanguage,
  saveLanguageChoice,
} from '../../../lib/language'

export const Route = createFileRoute('/_app/settings/language')({
  component: Language,
})

// Settings > Language (SYS-19): Automatic, Español or English, for this device. A
// choice takes effect at once, so there is no Save (DL-CMP-10).
function Language() {
  const { t, i18n } = useTranslation()
  const back = useSettingsBack()
  const [choice, setChoice] = useState(readLanguageChoice)

  function choose(next: LanguageChoice) {
    setChoice(next)
    saveLanguageChoice(next)
    void i18n.changeLanguage(resolveLanguage(next))
  }

  return (
    <Page
      title={t('settings.language.title')}
      back={back}
      card={{
        icon: <IconTile icon={TranslateIcon} size="large" />,
        description: t('settings.language.description'),
      }}
    >
      <List>
        {languageChoices.map((option) =>
          option === 'automatic' ? (
            <ChoiceRow
              key={option}
              role="radio"
              title={t('settings.language.automatic')}
              subtitle={t('settings.language.device', {
                language: t(`settings.language.names.${deviceLanguage()}`),
              })}
              checked={choice === option}
              onToggle={() => {
                choose(option)
              }}
            />
          ) : (
            // iOS lists each language by its own name, with the name in the current
            // language underneath when it differs, so anyone can find theirs.
            <ChoiceRow
              key={option}
              role="radio"
              title={nativeNames[option]}
              subtitle={
                option === i18n.language ? undefined : t(`settings.language.names.${option}`)
              }
              checked={choice === option}
              onToggle={() => {
                choose(option)
              }}
            />
          ),
        )}
      </List>
      <p className="-mt-1 px-4 text-[0.8125rem] text-text-muted">
        {t('settings.language.deviceNote')}
      </p>
    </Page>
  )
}
