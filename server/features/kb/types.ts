import type { KbCategory, KbEntry, KbTag } from '../../database/schema'

export type KbEntryStatus = 'inbox' | 'draft' | 'verified' | 'archived'
export type KbEntryAuthorType = 'human' | 'ai'
export type KbEntrySourceType = 'manual' | 'commit' | 'claude_code_session' | 'chat' | 'external'

export const KB_ENTRY_STATUSES: readonly KbEntryStatus[] = [
  'inbox',
  'draft',
  'verified',
  'archived',
] as const

export const KB_ENTRY_AUTHOR_TYPES: readonly KbEntryAuthorType[] = [
  'human',
  'ai',
] as const

export const KB_ENTRY_SOURCE_TYPES: readonly KbEntrySourceType[] = [
  'manual',
  'commit',
  'claude_code_session',
  'chat',
  'external',
] as const

/**
 * Thrown when {@link setStatus} or {@link update} is asked to move an entry
 * into a status that isn't valid in the current state. Carries `from` and
 * `to` so callers (API layer, UI) can render a useful message.
 *
 * REQ-KB-7 currently allows any transition between the four valid statuses,
 * so this only fires when the supplied status is not a recognised enum value.
 * The validation surface is kept here so future business rules can tighten
 * the matrix without touching call sites.
 */
export class KbInvalidStatusTransitionError extends Error {
  readonly from: KbEntryStatus
  readonly to: string
  constructor(from: KbEntryStatus, to: string) {
    super(`Invalid KB status transition from "${from}" to "${to}"`)
    this.name = 'KbInvalidStatusTransitionError'
    this.from = from
    this.to = to
  }
}

/**
 * Thrown by {@link purge} when the caller tries to hard-delete an entry that
 * is still live (i.e. `deleted_at IS NULL`). REQ-KB-9: hard-delete is only
 * allowed from the Trash UI, after a soft-delete has already happened.
 */
export class KbCannotPurgeActiveError extends Error {
  readonly entryId: string
  constructor(entryId: string) {
    super(`Cannot purge KB entry "${entryId}": entry is not soft-deleted`)
    this.name = 'KbCannotPurgeActiveError'
    this.entryId = entryId
  }
}

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
