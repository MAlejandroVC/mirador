import { z } from 'zod'

// SYS-18: the profile picture is the person's initial or one of these curated icons,
// never an uploaded image (DL-PRI-04). It lives in an encrypted record of this type, so
// every device shows the same one and the server never learns which.
export const profilePictures = [
  'initial',
  'mountains',
  'tree',
  'leaf',
  'flower',
  'cactus',
  'sun',
  'moon',
  'bird',
  'butterfly',
  'cat',
  'dog',
] as const

export type ProfilePicture = (typeof profilePictures)[number]

export const profileRecordType = 'profile'

export const profileRecord = z.object({ picture: z.enum(profilePictures) })
export type ProfileRecord = z.infer<typeof profileRecord>
