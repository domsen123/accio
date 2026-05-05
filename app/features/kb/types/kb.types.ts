/**
 * Client-side KB types — mirror the server response shapes returned by
 * `/api/kb/...` (T-1.7). Kept minimal for T-1.8; extend in later tasks
 * (T-1.9 markdown editor, T-1.10 inbox/trash actions, T-1.11 categories tree)
 * as the surface grows.
 */

export type KbEntryStatus = 'inbox' | 'draft' | 'verified' | 'archived'
export type KbEntryAuthorType = 'human' | 'ai'
export type KbEntrySourceType
  = | 'manual'
    | 'commit'
    | 'claude_code_session'
    | 'chat'
    | 'external'

export const KB_ENTRY_STATUSES: readonly KbEntryStatus[] = [
  'inbox',
  'draft',
  'verified',
  'archived',
]

export const KB_ENTRY_AUTHOR_TYPES: readonly KbEntryAuthorType[] = [
  'human',
  'ai',
]

export const KB_ENTRY_SOURCE_TYPES: readonly KbEntrySourceType[] = [
  'manual',
  'commit',
  'claude_code_session',
  'chat',
  'external',
]

export interface KbCategory {
  id: string
  organisationId: string
  parentId: string | null
  name: string
  slug: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface KbTag {
  id: string
  organisationId: string
  name: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface KbTagWithUsage extends KbTag {
  usageCount?: number
}

export interface KbEntry {
  id: string
  organisationId: string
  slug: string
  title: string
  bodyMd: string
  categoryId: string | null
  status: KbEntryStatus
  authorType: KbEntryAuthorType
  authorName: string
  sourceType: KbEntrySourceType
  sourceRef: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  category?: KbCategory | null
  tags?: KbTag[]
}

export interface KbEntriesListParams {
  search?: string
  status?: KbEntryStatus | KbEntryStatus[]
  categoryId?: string
  tagId?: string
  authorType?: KbEntryAuthorType
  sourceType?: KbEntrySourceType
  includeArchived?: boolean
  includeDeleted?: boolean
  limit?: number
  offset?: number
  sort?: string[]
}

export interface KbEntriesListResponse {
  data: KbEntry[]
  limit: number | null
  offset: number
}

export interface KbEntryResponse {
  entry: KbEntry
}

export interface KbCategoriesResponse {
  data: KbCategory[]
}

export interface KbTagsListParams {
  withUsage?: boolean
  includeDeleted?: boolean
}

export interface KbTagsResponse {
  data: KbTagWithUsage[]
}

export interface KbBacklinksResponse {
  data: KbEntry[]
}
