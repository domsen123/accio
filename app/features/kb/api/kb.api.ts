/**
 * KB API wrappers — typed `$fetch` calls into `/api/kb/...` (T-1.7).
 *
 * Mirrors the admin slice convention: a `useKbApi()` factory that grabs the
 * SSR-aware `$api` from `useNuxtApp()` so cookies forward correctly during
 * server-side rendering.
 *
 * Workspace context: T-1.7 routes accept an `X-Organisation-Id` header (or a
 * `?organisationId=` query) and fall back to the user's earliest-joined
 * organisation when neither is present. The session payload does not yet
 * expose the active workspace, so we let the server fall back. When the
 * workspace switcher persists the active org on the session, this wrapper is
 * the right place to inject the header.
 */
import type {
  KbBacklinksResponse,
  KbCategoriesResponse,
  KbEntriesListParams,
  KbEntriesListResponse,
  KbEntryResponse,
  KbPaginatedListParams,
  KbTagsListParams,
  KbTagsResponse,
} from '../types/kb.types'

export const useKbApi = () => {
  const { $api } = useNuxtApp()

  return {
    listEntries: (params?: KbEntriesListParams): Promise<KbEntriesListResponse> =>
      $api('/api/kb/entries', { query: params }),

    getEntryBySlug: (slug: string): Promise<KbEntryResponse> =>
      $api(`/api/kb/entries/${encodeURIComponent(slug)}`),

    getEntryBacklinks: (id: string): Promise<KbBacklinksResponse> =>
      $api(`/api/kb/entries/${encodeURIComponent(id)}/backlinks`),

    listInbox: (params?: KbPaginatedListParams): Promise<KbEntriesListResponse> =>
      $api('/api/kb/inbox', { query: params }),

    listTrash: (params?: KbPaginatedListParams): Promise<KbEntriesListResponse> =>
      $api('/api/kb/trash', { query: params }),

    listCategories: (): Promise<KbCategoriesResponse> =>
      $api('/api/kb/categories'),

    listTags: (params?: KbTagsListParams): Promise<KbTagsResponse> =>
      $api('/api/kb/tags', {
        query: {
          ...(params?.withUsage ? { withUsage: '1' } : {}),
          ...(params?.includeDeleted ? { includeDeleted: '1' } : {}),
        },
      }),
  }
}
