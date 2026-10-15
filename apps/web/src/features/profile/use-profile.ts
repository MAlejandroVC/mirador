import { type ProfilePicture, profileRecord, profileRecordType, type RecordBody } from '@repo/api'
import { newRecordId } from '@repo/crypto'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { VaultClient } from '../../lib/vault'
import { useVault } from '../security/hooks/vault'

const profileKey = ['profile'] as const

// SYS-18: the profile is one encrypted record, read from the worker's decrypted copy.
async function readProfile(vault: VaultClient) {
  for (const record of await vault.listRecords()) {
    const body: RecordBody = record.body
    if (body.deleted || body.type !== profileRecordType) continue
    const parsed = profileRecord.safeParse(body.data)
    if (parsed.success) return { id: record.id, picture: parsed.data.picture }
  }
  return null
}

/** The person's profile picture; `initial` until they pick one. */
export function useProfilePicture(): ProfilePicture {
  const vault = useVault()
  const { data } = useQuery({ queryKey: profileKey, queryFn: () => readProfile(vault) })
  return data?.picture ?? 'initial'
}

// Saves through @repo/sync, so it is encrypted before it leaves (SEC-01).
export function useSaveProfilePicture() {
  const vault = useVault()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (picture: ProfilePicture) => {
      const current = await readProfile(vault)
      await vault.saveRecords([
        {
          id: current?.id ?? newRecordId(),
          body: { deleted: false, type: profileRecordType, schema: 1, data: { picture } },
        },
      ])
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: profileKey }),
  })
}
