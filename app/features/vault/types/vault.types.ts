/**
 * Client-side TypeScript types for the vault feature (T-V-23+).
 *
 * Mirrors the response shapes the server emits — kept narrow to what the
 * UI actually consumes. The encrypted `payload` blob shape is NOT exposed
 * here: pages always work in plaintext (`PlainEntryPayload`) since the
 * server decrypts on read.
 */

export interface VaultStatusResponse {
  isSetup: boolean
  isUnlocked: boolean
  locksAt: string | null
}

export interface VaultCustomField {
  name: string
  isSecret: boolean
  value: string
}

export interface PlainEntryPayload {
  username: string | null
  password: string | null
  url: string | null
  notes: string | null
  customFields: VaultCustomField[]
}

export interface VaultEntryMeta {
  id: string
  organisationId: string
  folderId: string | null
  title: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface VaultEntryDetail {
  entry: VaultEntryMeta
  payload: PlainEntryPayload
}

export interface VaultEntriesListResponse {
  data: VaultEntryMeta[]
  limit: number | null
  offset: number
}

export interface VaultFolder {
  id: string
  organisationId: string
  parentId: string | null
  name: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface VaultTag {
  id: string
  organisationId: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface CreateEntryBody {
  title: string
  folderId?: string | null
  payload: PlainEntryPayload
  tagNames?: string[]
}

export interface UpdateEntryBody {
  title?: string
  folderId?: string | null
  payload?: PlainEntryPayload
  tagNames?: string[]
}
