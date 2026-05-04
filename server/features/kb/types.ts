import type { KbCategory, KbEntry, KbTag } from '../../database/schema'

export type KbEntryStatus = 'inbox' | 'draft' | 'verified' | 'archived'
export type KbEntryAuthorType = 'human' | 'ai'
export type KbEntrySourceType = 'manual' | 'commit' | 'claude_code_session' | 'chat' | 'external'

export interface CreateKbEntryInput {
  organisationId: string
  title: string
  body?: string
  categoryId?: string | null
  tagNames?: string[]
  status?: KbEntryStatus
  authorType?: KbEntryAuthorType
  authorName?: string
  sourceType?: KbEntrySourceType
  sourceRef?: string | null
  createdBy?: string | null
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

export interface ListKbEntriesInput {
  organisationId: string
  status?: KbEntryStatus | KbEntryStatus[]
  categoryId?: string
  tagId?: string
  authorType?: KbEntryAuthorType
  sourceType?: KbEntrySourceType
  includeDeleted?: boolean
  includeArchived?: boolean
  search?: string
  limit?: number
  offset?: number
  sort?: string[]
}

export interface KbEntryWithRelations extends KbEntry {
  tags: KbTag[]
  category: KbCategory | null
}
