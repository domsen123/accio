/**
 * KB entry mutations (T-1.9, extended in T-1.10).
 *
 * Mirrors the `useAdminBlogPostMutations` pattern: each call returns a
 * Pinia Colada `useMutation` so the form/page owns the loading + error
 * surface. Invalidation is centralised in `invalidateEntry` so every page
 * (list, detail, inbox, trash) stays in sync after any mutation.
 *
 * T-1.10 additions:
 *   - `useVerifyKbEntry` / `useMarkKbEntryDraft` / `useArchiveKbEntry` —
 *     thin wrappers around `setStatus` for the inbox one-click actions.
 *   - `usePurgeKbEntry` — hard-delete from Trash (ADR-009: only Trash UI
 *     calls this; service enforces "must be soft-deleted first").
 *   - Invalidation now also clears `inbox` and `trash` query families so
 *     status / soft-delete / restore / purge all keep both pages fresh.
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

/**
 * Centralised invalidation. Every entry-mutating call should funnel through
 * this so list / detail / inbox / trash / backlinks views stay coherent.
 *
 * `entry` may be undefined when the server returns no payload (e.g. purge:
 * 204 No Content). In that case we still wipe the broad families.
 */
const invalidateEntry = (
  queryCache: ReturnType<typeof useQueryCache>,
  entry: KbEntry | undefined,
) => {
  queryCache.invalidateQueries({ key: kbKeys.entries() })
  queryCache.invalidateQueries({ key: kbKeys.inbox() })
  queryCache.invalidateQueries({ key: kbKeys.trash() })
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

/**
 * Inbox quick-actions: Verify / Draft / Archive (T-1.10).
 *
 * Each one is a setStatus call to a fixed target status — wrapped so the
 * inbox page can name what the click does (`verify(id)` reads better than
 * `setStatus({ id, status: 'verified' })` at the call site).
 */
const useSetStatusFixed = (target: KbEntryStatus) => {
  const queryCache = useQueryCache()
  const { $api } = useNuxtApp()

  return useMutation({
    mutation: (id: string): Promise<{ entry: KbEntry }> =>
      $api(`/api/kb/entries/${id}/status`, {
        method: 'POST',
        body: { status: target },
      }),
    onSuccess: ({ entry }) => {
      invalidateEntry(queryCache, entry)
    },
  })
}

export const useVerifyKbEntry = () => useSetStatusFixed('verified')
export const useMarkKbEntryDraft = () => useSetStatusFixed('draft')
export const useArchiveKbEntry = () => useSetStatusFixed('archived')

/**
 * Hard-delete (T-1.10, ADR-009). Only callable from the Trash UI on
 * already-soft-deleted entries; the server returns 204 No Content, so the
 * mutation resolves to `null`. Invalidation runs without an entry payload
 * (we don't need a slug — the trash list is what matters here).
 */
export const usePurgeKbEntry = () => {
  const queryCache = useQueryCache()
  const { $api } = useNuxtApp()

  return useMutation({
    mutation: (id: string): Promise<null> =>
      $api(`/api/kb/entries/${id}/purge`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidateEntry(queryCache, undefined)
    },
  })
}

export interface CreateKbCategoryInput {
  name: string
  parentId?: string | null
}

/**
 * Categories show up on hydrated entry rows, so any category mutation also
 * busts the entries family — otherwise the list view would render stale
 * `entry.category.name` after a rename.
 */
const invalidateCategoriesAndEntries = (
  queryCache: ReturnType<typeof useQueryCache>,
) => {
  queryCache.invalidateQueries({ key: kbKeys.categories() })
  queryCache.invalidateQueries({ key: kbKeys.entries() })
}

export const useCreateKbCategory = () => {
  const queryCache = useQueryCache()
  const { $api } = useNuxtApp()

  return useMutation({
    mutation: (data: CreateKbCategoryInput): Promise<{ category: KbCategory }> =>
      $api('/api/kb/categories', { method: 'POST', body: data }),
    onSuccess: () => invalidateCategoriesAndEntries(queryCache),
  })
}

/**
 * Rename a category (T-1.11). Slug is intentionally stable — see the
 * server-side comment in `PATCH /api/kb/categories/[id]`.
 */
export const useRenameKbCategory = () => {
  const queryCache = useQueryCache()
  const { $api } = useNuxtApp()

  return useMutation({
    mutation: ({ id, name }: { id: string, name: string }): Promise<{ category: KbCategory }> =>
      $api(`/api/kb/categories/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: { name },
      }),
    onSuccess: () => invalidateCategoriesAndEntries(queryCache),
  })
}

/**
 * Soft-delete a category (T-1.11). The server keeps the row but flips
 * `deleted_at`; the default `list({ includeDeleted: false })` filter then
 * hides it from the tree. Entries previously bucketed under this category
 * keep their `categoryId` (no cascade) — restoring the category brings the
 * tree back unchanged.
 */
export const useDeleteKbCategory = () => {
  const queryCache = useQueryCache()
  const { $api } = useNuxtApp()

  return useMutation({
    mutation: (id: string): Promise<void> =>
      $api(`/api/kb/categories/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: () => invalidateCategoriesAndEntries(queryCache),
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
