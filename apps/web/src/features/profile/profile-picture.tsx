import type { ProfilePicture as Picture } from '@repo/api'
import {
  BirdIcon,
  ButterflyIcon,
  CactusIcon,
  CatIcon,
  DogIcon,
  FlowerTulipIcon,
  type Icon,
  LeafIcon,
  MoonStarsIcon,
  MountainsIcon,
  SunIcon,
  TreeEvergreenIcon,
} from '../../components/ui/icons'
import { tileStyle } from '../../components/ui/tile-style'

const icons: Record<Exclude<Picture, 'initial'>, Icon> = {
  mountains: MountainsIcon,
  tree: TreeEvergreenIcon,
  leaf: LeafIcon,
  flower: FlowerTulipIcon,
  cactus: CactusIcon,
  sun: SunIcon,
  moon: MoonStarsIcon,
  bird: BirdIcon,
  butterfly: ButterflyIcon,
  cat: CatIcon,
  dog: DogIcon,
}

// SYS-18, DL-ICO-02: the profile picture is a round app tile: the initial or a Duotone
// icon in `brand` on `brand` mixed into the surface (DL-COL-08). It belongs to the app,
// so it never takes a category color (DL-COL-13).
export function ProfilePicture({
  picture,
  username,
  size,
}: {
  picture: Picture
  username: string
  /** Diameter in rem. */
  size: number
}) {
  const PictureIcon = picture === 'initial' ? null : icons[picture]
  return (
    <span
      aria-hidden
      style={{
        ...tileStyle(),
        width: `${size}rem`,
        height: `${size}rem`,
        fontSize: `${size * 0.45}rem`,
      }}
      className="grid shrink-0 place-items-center rounded-full font-semibold"
    >
      {PictureIcon ? (
        <PictureIcon weight="duotone" style={{ width: '58%', height: '58%' }} />
      ) : (
        username.charAt(0).toUpperCase()
      )}
    </span>
  )
}
