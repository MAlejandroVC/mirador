import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBack } from '../../../components/shell/back'
import { IconTile } from '../../../components/ui/icon-tile'
import { CheckIcon, PaletteIcon } from '../../../components/ui/icons'
import { List } from '../../../components/ui/list'
import { Page } from '../../../components/ui/page'
import { SegmentedControl } from '../../../components/ui/segmented-control'
import {
  type Mode,
  modes,
  type Palette,
  paletteNames,
  palettes,
  readAppearance,
  saveAppearance,
  type Swatch,
  swatches,
} from '../../../lib/appearance'

export const Route = createFileRoute('/_app/settings/appearance')({
  component: Appearance,
})

// Settings > Appearance: the mode (SYS-16) and the palette (SYS-17), as drawn in
// docs/design-language-palettes.html. Both take effect at once, so there is no Save.
function Appearance() {
  const { t } = useTranslation()
  const back = useBack()
  const [appearance, setAppearance] = useState(readAppearance)
  const deviceDark = useDeviceDark()
  const shownMode =
    appearance.mode === 'automatic' ? (deviceDark ? 'dark' : 'light') : appearance.mode

  function choose(next: Partial<typeof appearance>) {
    const chosen = { ...appearance, ...next }
    setAppearance(chosen)
    saveAppearance(chosen)
  }

  return (
    <Page
      title={t('settings.appearance.title')}
      back={back}
      card={{
        icon: <IconTile icon={PaletteIcon} size="large" />,
        description: t('settings.appearance.description'),
      }}
    >
      <List label={t('settings.appearance.mode')}>
        <li className="p-2.5">
          <SegmentedControl<Mode>
            label={t('settings.appearance.mode')}
            options={modes.map((mode) => ({
              value: mode,
              label: t(`settings.appearance.modes.${mode}`),
            }))}
            value={appearance.mode}
            onChange={(mode) => {
              choose({ mode })
            }}
          />
        </li>
      </List>
      <List label={t('settings.appearance.palette')}>
        <li
          role="radiogroup"
          aria-label={t('settings.appearance.palette')}
          className="grid grid-cols-2 gap-3 p-3 md:grid-cols-4"
        >
          {palettes.map((palette) => (
            <PaletteOption
              key={palette}
              palette={palette}
              swatch={swatches[palette][shownMode]}
              checked={palette === appearance.palette}
              onChoose={() => {
                choose({ palette })
              }}
            />
          ))}
        </li>
      </List>
      <p className="-mt-1 px-4 text-[0.8125rem] text-text-muted">
        {t('settings.appearance.categoryNote')}
      </p>
    </Page>
  )
}

// A small drawing of a screen in the palette: its background, the hero card with its
// glow, two rows and the + in `brand`. The rows show two category colors, since those
// stay the same in every palette (DL-COL-01).
function PaletteOption({
  palette,
  swatch,
  checked,
  onChoose,
}: {
  palette: Palette
  swatch: Swatch
  checked: boolean
  onChoose: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onChoose}
      className="flex flex-col items-stretch gap-1.5 text-left rounded-[0.875rem] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-brand"
    >
      <span
        aria-hidden
        style={{
          background: swatch.background,
          boxShadow: checked
            ? '0 0 0 2.5px var(--color-brand)'
            : `inset 0 0 0 0.5px ${swatch.separator}`,
        }}
        className="relative flex aspect-[1.15] w-full flex-col gap-[5px] rounded-xl p-[7px]"
      >
        <span
          style={{
            background:
              swatch.glow === 'transparent'
                ? swatch.hero
                : `radial-gradient(circle at 100% 0, color-mix(in srgb, ${swatch.glow} 40%, transparent), transparent 75%), ${swatch.hero}`,
          }}
          className="h-[42%] rounded-[7px]"
        />
        {(['moss', 'lake'] as const).map((color) => (
          <span
            key={color}
            style={{ background: swatch.surface }}
            className="flex h-[16%] items-center gap-1 rounded-[5px] px-[5px]"
          >
            <i
              style={{ background: `var(--mirador-${color})` }}
              className="size-[7px] rounded-[2px]"
            />
            <s
              style={{ background: `var(--mirador-${color})` }}
              className="h-[3px] flex-1 rounded-full opacity-50"
            />
          </span>
        ))}
        <span
          style={{ background: swatch.brand }}
          className="absolute right-1.5 bottom-1.5 size-3.5 rounded-full"
        />
      </span>
      <span className="flex items-center gap-1.5 px-0.5 text-[0.8125rem] font-medium text-text">
        <span
          className={`grid size-[1.125rem] place-items-center rounded-full border-[1.5px] ${
            checked ? 'border-brand bg-brand text-on-brand' : 'border-text-faint'
          }`}
        >
          {checked && <CheckIcon aria-hidden weight="bold" className="size-[0.6875rem]" />}
        </span>
        {paletteNames[palette]}
      </span>
    </button>
  )
}

// Automatic follows the device, so the drawings do too.
function useDeviceDark() {
  const query = '(prefers-color-scheme: dark)'
  const [dark, setDark] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query)
    const changed = () => {
      setDark(media.matches)
    }
    media.addEventListener('change', changed)
    return () => {
      media.removeEventListener('change', changed)
    }
  }, [])
  return dark
}
