import { type ProfilePicture as Picture, profilePictures } from '@repo/api'
import { useTranslation } from 'react-i18next'
import { ProfilePicture } from './profile-picture'

// SYS-18: the person's initial or one of the curated icons, as a radio group so it
// reads as one choice; the chosen one gets a `brand` ring.
export function PicturePicker({
  value,
  username,
  onChange,
}: {
  value: Picture
  username: string
  onChange: (picture: Picture) => void
}) {
  const { t } = useTranslation()
  return (
    <div
      role="radiogroup"
      aria-label={t('profile.picture')}
      className="grid grid-cols-4 justify-items-center gap-3"
    >
      {profilePictures.map((picture) => {
        const checked = picture === value
        return (
          <button
            key={picture}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={t(`profile.pictures.${picture}`)}
            onClick={() => {
              onChange(picture)
            }}
            className={`grid size-16 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
              checked ? 'shadow-[0_0_0_2.5px_var(--color-brand)]' : ''
            }`}
          >
            <ProfilePicture picture={picture} username={username} size={3.25} />
          </button>
        )
      })}
    </div>
  )
}
