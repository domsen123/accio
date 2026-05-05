/**
 * KB entry mutations (T-1.9).
 *
 * Mirrors the `useAdminBlogPostMutations` pattern: each call returns a
 * Pinia Colada `useMutation` so the form/page owns the loading + error
 * surface. We invalidate both the list query family and the affected
 * `entry-by-slug` query so subsequent navigations pick up fresh data.
 */
import type {
  KbCategory,
  KbEntry,
  KbEntryAuthorType,
  KbEntrySourceType,
  KbEntryStatus,
  KbTag,
} from '../types/kb.types'
import { useMutation, useQueryCache } from '@pinia/colada'
import { kbKeys } from '../api/kb.keys'

export interface CreateKbEntryInput {
  title: string
  body?: string
  categoryId?: string | null
  tagNames?: string[]
  status?: KbEntryStatus
  authorType?: KbEntryAuthorType
  authorName?: string
  sourceType?: KbEntrySourceType
  sourceRef?: string | null
}

export interface UpdateKbEntryInput {
  title?: string
  body?: string
  categoryId?: string | null
  tagNames?: string[]
  status?: KbEntryStatus
  authorType?: KbEntryAuthorType
  authorName?: string
  sourceType?: KbEntrySourceType
  sourceRef?: string | null
}

const invalidateEntry = (
  queryCache: ReturnType<typeof useQueryCache>,
  entry: KbEntry | undefined,
) => {
  queryCache.invalidateQueries({ key: kbKeys.entries() })
  if (entry?.slug)
    queryCache.invalidateQueries({ key: kbKeys.entry(entry.slug) })
  if (entry?.id)
    queryCache.invalidateQueries({ key: kbKeys.entryBacklinks(entry.id) })
}

export const useCreateKbEntry = () => {
  const queryCache = useQueryCache()
  const { $api } = useNuxtApp()

  return useMutation({
    mutation: (data: CreateKbEntryInput): Promise<{ entry: KbEntry }> =>
      $api('/api/kb/entries', { method: 'POST', body: data }),
    onSuccess: ({ entry }) => {
      invalidateEntry(queryCache, entry)
    },
  })
}

export const useUpdateKbEntry = () => {
  const queryCache = useQueryCache()
  const { $api } = useNuxtApp()

  return useMutation({
    mutation: ({ id, data }: { id: string, data: UpdateKbEntryInput }): Promise<{ entry: KbEntry }> =>
      $api(`/api/kb/entries/${id}`, { method: 'PATCH', body: data }),
    onSuccess: ({ entry }) => {
      invalidateEntry(queryCache, entry)
    },
  })
}

export const useDeleteKbEntry = () => {
  const queryCache = useQueryCache()
  const { $api } = useNuxtApp()

  return useMutation({
    mutation: (id: string): Promise<{ entry: KbEntry }> =>
      $api(`/api/kb/entries/${id}`, { method: 'DELETE' }),
    onSuccess: ({ entry }) => {
      invalidateEntry(queryCache, entry)
    },
  })
}

export const useRestoreKbEntry = () => {
  const queryCache = useQueryCache()
  const { $api } = useNuxtApp()

  return useMutation({
    mutation: (id: string): Promise<{ entry: KbEntry }> =>
      $api(`/api/kb/entries/${id}/restore`, { method: 'POST' }),
    onSuccess: ({ entry }) => {
      invalidateEntry(queryCache, entry)
    },
  })
}

export const useSetKbEntryStatus = () => {
  const queryCache = useQueryCache()
  const { $api } = useNuxtApp()

  return useMutation({
    mutation: ({ id, status }: { id: string, status: KbEntryStatus }): Promise<{ entry: KbEntry }> =>
      $api(`/api/kb/entries/${id}/status`, {
        method: 'POST',
        body: { status },
      }),
    onSuccess: ({ entry }) => {
      invalidateEntry(queryCache, entry)
    },
  })
}

export interface CreateKbCategoryInput {
  name: string
  parentId?: string | null
}

export const useCreateKbCategory = () => {
  const queryCache = useQueryCache()
  const { $api } = useNuxtApp()

  return useMutation({
    mutation: (data: CreateKbCategoryInput): Promise<{ category: KbCategory }> =>
      $api('/api/kb/categories', { method: 'POST', body: data }),
    onSuccess: () => {
      queryCache.invalidateQueries({ key: kbKeys.categories() })
    },
  })
}

export const useCreateKbTag = () => {
  const queryCache = useQueryCache()
  const { $api } = useNuxtApp()

  return useMutation({
    mutation: (data: { name: string }): Promise<{ tag: KbTag }> =>
      $api('/api/kb/tags', { method: 'POST', body: data }),
    onSuccess: () => {
      queryCache.invalidateQueries({ key: kbKeys.tags() })
    },
  })
}
