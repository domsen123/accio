/**
 * Pinia Colada query keys for the KB feature.
 * Convention follows `app/features/admin/api/admin.keys.ts`.
 */
import type {
  KbEntriesListParams,
  KbLinkedTodosParams,
  KbPaginatedListParams,
  KbTagsListParams,
} from '../types/kb.types'

export const kbKeys = {
  all: ['kb'] as const,
  entries: (params?: KbEntriesListParams) => params
    ? [...kbKeys.all, 'entries', params] as const
    : [...kbKeys.all, 'entries'] as const,
  entry: (slug: string) => [...kbKeys.all, 'entry', slug] as const,
  entryBacklinks: (id: string) => [...kbKeys.all, 'entry', id, 'backlinks'] as const,
  entryLinkedTodos: (id: string, params?: KbLinkedTodosParams) => params
    ? [...kbKeys.all, 'entry', id, 'linked-todos', params] as const
    : [...kbKeys.all, 'entry', id, 'linked-todos'] as const,
  inbox: (params?: KbPaginatedListParams) => params
    ? [...kbKeys.all, 'inbox', params] as const
    : [...kbKeys.all, 'inbox'] as const,
  trash: (params?: KbPaginatedListParams) => params
    ? [...kbKeys.all, 'trash', params] as const
    : [...kbKeys.all, 'trash'] as const,
  categories: () => [...kbKeys.all, 'categories'] as const,
  tags: (params?: KbTagsListParams) => params
    ? [...kbKeys.all, 'tags', params] as const
    : [...kbKeys.all, 'tags'] as const,
}
