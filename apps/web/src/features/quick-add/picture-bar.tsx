import type { ReceiptField } from '@repo/import'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { FieldNote } from '../../components/ui/field-row'
import { CameraIcon, CircleNotchIcon, ImageIcon } from '../../components/ui/icons'

/** WID-02, IMP-07: where quick add's picture stands, kept by the quick-add sheet. */
export interface PictureState {
  phase: 'idle' | 'reading' | 'filled' | 'failed'
  failure?: 'unreadable' | 'unavailable' | 'offline'
  /** IMP-10: what was hard to read, for the person to check. */
  unsure: ReceiptField[]
  /** The picture, small, while it is read and once it filled the form in. */
  thumb: string | null
  /** The shop as written on the picture, matched to a payee by the form. */
  payeeName?: string
  /** Changes each time a picture fills the form in, so it starts again from it. */
  version: number
  onPick: (file: File) => void
}

// WID-01, WID-04: the two picture options under the amount, so a ticket is one tap
// away while typing an amount stays exactly as before: the amount keeps the caret and
// the keypad stays up. "Take a picture" opens the camera where the browser can.
export function PictureBar({ picture }: { picture: PictureState }) {
  const { t } = useTranslation()
  const camera = useRef<HTMLInputElement>(null)
  const library = useRef<HTMLInputElement>(null)
  const inputs = (
    <>
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) picture.onPick(file)
        }}
      />
      <input
        ref={library}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) picture.onPick(file)
        }}
      />
    </>
  )

  if (picture.phase === 'reading')
    return (
      <div className="flex flex-col items-center gap-1 pt-1" role="status">
        <span className="flex items-center gap-2.5 text-[0.9375rem] text-text-muted">
          {picture.thumb && <Thumb url={picture.thumb} />}
          <CircleNotchIcon
            aria-hidden
            weight="bold"
            className="size-[1.125rem] animate-spin text-brand motion-reduce:animate-none"
          />
          {t('quickAdd.reading')}
        </span>
        <span className="text-[0.8125rem] text-text-muted">{t('quickAdd.private')}</span>
      </div>
    )

  if (picture.phase === 'filled')
    return (
      <>
        {inputs}
        <button
          type="button"
          onClick={() => library.current?.click()}
          className="mx-auto flex min-h-11 items-center gap-2 px-2 text-[0.8125rem] text-text-muted focus-visible:outline-2 focus-visible:outline-brand"
        >
          {picture.thumb && <Thumb url={picture.thumb} />}
          {t('quickAdd.filledIn')}
        </button>
        {picture.unsure.includes('amount') && (
          <FieldNote error>{t('quickAdd.check.amount')}</FieldNote>
        )}
      </>
    )

  return (
    <>
      {inputs}
      {/* DL-CMP-05: tinted, second to the amount the form is about. */}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={tinted} onClick={() => camera.current?.click()}>
          <CameraIcon aria-hidden weight="duotone" className="size-5 shrink-0" />
          {t('quickAdd.takePicture')}
        </button>
        <button type="button" className={tinted} onClick={() => library.current?.click()}>
          <ImageIcon aria-hidden weight="duotone" className="size-5 shrink-0" />
          {t('quickAdd.choosePicture')}
        </button>
      </div>
      {picture.phase === 'failed' && picture.failure && (
        <FieldNote error>{t(`quickAdd.failed.${picture.failure}`)}</FieldNote>
      )}
    </>
  )
}

// DL-CMP-05: the tinted secondary button, a little smaller than a form's main action so
// two fit side by side on a phone without wrapping.
const tinted =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-[color-mix(in_srgb,var(--color-brand)_14%,var(--color-surface))] px-2 text-[0.9375rem] font-semibold whitespace-nowrap text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

function Thumb({ url }: { url: string }) {
  return (
    <span
      aria-hidden
      className="block h-9 w-7 shrink-0 rounded-[0.3125rem] bg-inset bg-cover bg-center"
      style={{ backgroundImage: `url(${url})` }}
    />
  )
}
