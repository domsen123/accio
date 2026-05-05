import type { ListEntriesParams } from '../api/vault.api'
import type {
  CreateEntryBody,
  UpdateEntryBody,
  VaultEntryDetail,
  VaultEntryMeta,
} from '../types/vault.types'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { useVaultApi, vaultKeys } from '../api/vault.api'

/**
 * Pinia Colada bindings for vault entries / folders / tags.
 * Mutations invalidate the relevant query branches via `useQueryCache`.
 */

export const useVaultEntriesList = (params: () => ListEntriesParams | undefined) => {
  const api = useVaultApi()
  return useQuery({
    key: () => vaultKeys.entries(params()),
    query: () => api.listEntries(params()),
  })
}

export const useVaultEntry = (id: () => string | undefined | null) => {
  const api = useVaultApi()
  return useQuery({
    key: () => vaultKeys.entry(id() ?? '__none'),
    query: () => {
      const v = id()
      if (!v)
        return Promise.resolve(null as unknown as VaultEntryDetail)
      return api.getEntry(v)
    },
    enabled: () => !!id(),
  })
}

export const useVaultFolders = () => {
  const api = useVaultApi()
  return useQuery({
    key: vaultKeys.folders(),
    query: () => api.listFolders(),
  })
}

export const useVaultTags = () => {
  const api = useVaultApi()
  return useQuery({
    key: vaultKeys.tags(),
    query: () => api.listTags(),
  })
}

export const useVaultTrash = () => {
  const api = useVaultApi()
  return useQuery({
    key: vaultKeys.trash(),
    query: () => api.listTrash(),
  })
}

const invalidateEntries = (cache: ReturnType<typeof useQueryCache>) => {
  cache.invalidateQueries({ key: ['vault', 'entries'] })
  cache.invalidateQueries({ key: ['vault', 'trash'] })
}

export const useCreateVaultEntry = () => {
  const api = useVaultApi()
  const cache = useQueryCache()
  return useMutation({
    mutation: (body: CreateEntryBody) => api.createEntry(body),
    onSuccess: () => invalidateEntries(cache),
  })
}

export const useUpdateVaultEntry = () => {
  const api = useVaultApi()
  const cache = useQueryCache()
  return useMutation({
    mutation: ({ id, body }: { id: string, body: UpdateEntryBody }) => api.updateEntry(id, body),
    onSuccess: ({ entry }: { entry: VaultEntryMeta }) => {
      cache.invalidateQueries({ key: vaultKeys.entry(entry.id) })
      invalidateEntries(cache)
    },
  })
}

export const useSoftDeleteVaultEntry = () => {
  const api = useVaultApi()
  const cache = useQueryCache()
  return useMutation({
    mutation: (id: string) => api.softDeleteEntry(id),
    onSuccess: () => invalidateEntries(cache),
  })
}

export const useRestoreVaultEntry = () => {
  const api = useVaultApi()
  const cache = useQueryCache()
  return useMutation({
    mutation: (id: string) => api.restoreEntry(id),
    onSuccess: () => invalidateEntries(cache),
  })
}

export const usePurgeVaultEntry = () => {
  const api = useVaultApi()
  const cache = useQueryCache()
  return useMutation({
    mutation: (id: string) => api.purgeEntry(id),
    onSuccess: () => invalidateEntries(cache),
  })
}

export const useDuplicateVaultEntry = () => {
  const api = useVaultApi()
  const cache = useQueryCache()
  return useMutation({
    mutation: (id: string) => api.duplicateEntry(id),
    onSuccess: () => invalidateEntries(cache),
  })
}

export const useCreateVaultFolder = () => {
  const api = useVaultApi()
  const cache = useQueryCache()
  return useMutation({
    mutation: (body: { name: string, parentId?: string | null }) => api.createFolder(body),
    onSuccess: () => cache.invalidateQueries({ key: vaultKeys.folders() }),
  })
}

export const useUpdateVaultFolder = () => {
  const api = useVaultApi()
  const cache = useQueryCache()
  return useMutation({
    mutation: ({ id, body }: { id: string, body: { name?: string, parentId?: string | null } }) => api.updateFolder(id, body),
    onSuccess: () => cache.invalidateQueries({ key: vaultKeys.folders() }),
  })
}

export const useDeleteVaultFolder = () => {
  const api = useVaultApi()
  const cache = useQueryCache()
  return useMutation({
    mutation: ({ id, strategy }: { id: string, strategy: 'move_to_parent' | 'delete_recursive' }) =>
      api.deleteFolder(id, { strategy }),
    onSuccess: () => {
      cache.invalidateQueries({ key: vaultKeys.folders() })
      invalidateEntries(cache)
    },
  })
}
