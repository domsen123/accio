/**
 * Vault API wrappers — typed `$fetch` calls into `/api/vault/...`.
 *
 * Mirrors the KB feature's pattern (`useKbApi`) so cookies forward through
 * SSR. Vault routes return HTTP 423 when the vault is locked; callers
 * should catch the error and prompt for unlock via the global unlock
 * dialog (T-V-23).
 */
import type {
  CreateEntryBody,
  UpdateEntryBody,
  VaultEntriesListResponse,
  VaultEntryDetail,
  VaultEntryMeta,
  VaultFolder,
  VaultStatusResponse,
  VaultTag,
} from '../types/vault.types'

export interface ListEntriesParams {
  folderId?: string
  rootOnly?: boolean
  tagId?: string
  q?: string
  limit?: number
  offset?: number
}

export const useVaultApi = () => {
  const { $api } = useNuxtApp()

  return {
    // ── status / lifecycle ─────────────────────────────────────────────
    getStatus: (): Promise<VaultStatusResponse> => $api('/api/vault/status'),

    setup: (body: { masterPassword: string, acknowledgeIrrecoverable: true }): Promise<{ ok: true }> =>
      $api('/api/vault/setup', { method: 'POST', body }),

    initWorkspace: (body: { masterPassword: string }): Promise<{ ok: true }> =>
      $api('/api/vault/workspace/init', { method: 'POST', body }),

    unlock: (body: { masterPassword: string }): Promise<{ ok: true, locksAt: string }> =>
      $api('/api/vault/unlock', { method: 'POST', body }),

    lock: (): Promise<{ ok: true }> =>
      $api('/api/vault/lock', { method: 'POST' }),

    changeMaster: (body: { currentPassword: string, newPassword: string }): Promise<{ ok: true }> =>
      $api('/api/vault/change-master', { method: 'POST', body }),

    reset: (): Promise<{ ok: true }> =>
      $api('/api/vault/reset', { method: 'POST', body: { confirm: true } }),

    // ── entries ─────────────────────────────────────────────────────────
    listEntries: (params?: ListEntriesParams): Promise<VaultEntriesListResponse> =>
      $api('/api/vault/entries', { query: params }),

    getEntry: (id: string): Promise<VaultEntryDetail> =>
      $api(`/api/vault/entries/${encodeURIComponent(id)}`),

    createEntry: (body: CreateEntryBody): Promise<{ entry: VaultEntryMeta }> =>
      $api('/api/vault/entries', { method: 'POST', body }),

    updateEntry: (id: string, body: UpdateEntryBody): Promise<{ entry: VaultEntryMeta }> =>
      $api(`/api/vault/entries/${encodeURIComponent(id)}`, { method: 'PATCH', body }),

    softDeleteEntry: (id: string): Promise<{ ok: true }> =>
      $api(`/api/vault/entries/${encodeURIComponent(id)}`, { method: 'DELETE' }),

    restoreEntry: (id: string): Promise<{ entry: VaultEntryMeta }> =>
      $api(`/api/vault/entries/${encodeURIComponent(id)}/restore`, { method: 'POST' }),

    duplicateEntry: (id: string): Promise<{ entry: VaultEntryMeta }> =>
      $api(`/api/vault/entries/${encodeURIComponent(id)}/duplicate`, { method: 'POST' }),

    purgeEntry: (id: string): Promise<{ ok: true }> =>
      $api(`/api/vault/entries/${encodeURIComponent(id)}/purge`, { method: 'DELETE' }),

    listTrash: (): Promise<{ data: VaultEntryMeta[] }> =>
      $api('/api/vault/trash'),

    // ── folders ─────────────────────────────────────────────────────────
    listFolders: (): Promise<{ data: VaultFolder[] }> =>
      $api('/api/vault/folders'),

    createFolder: (body: { name: string, parentId?: string | null }): Promise<{ folder: VaultFolder }> =>
      $api('/api/vault/folders', { method: 'POST', body }),

    updateFolder: (id: string, body: { name?: string, parentId?: string | null }): Promise<{ folder: VaultFolder }> =>
      $api(`/api/vault/folders/${encodeURIComponent(id)}`, { method: 'PATCH', body }),

    deleteFolder: (id: string, body: { strategy: 'move_to_parent' | 'delete_recursive' }): Promise<{ ok: true }> =>
      $api(`/api/vault/folders/${encodeURIComponent(id)}`, { method: 'DELETE', body }),

    // ── tags ────────────────────────────────────────────────────────────
    listTags: (): Promise<{ data: VaultTag[] }> =>
      $api('/api/vault/tags'),

    createTag: (body: { name: string }): Promise<{ tag: VaultTag }> =>
      $api('/api/vault/tags', { method: 'POST', body }),

    deleteTag: (id: string): Promise<{ ok: true }> =>
      $api(`/api/vault/tags/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  }
}

export type VaultApi = ReturnType<typeof useVaultApi>

export const vaultKeys = {
  status: () => ['vault', 'status'] as const,
  entries: (params?: ListEntriesParams) => ['vault', 'entries', params ?? {}] as const,
  entry: (id: string) => ['vault', 'entry', id] as const,
  folders: () => ['vault', 'folders'] as const,
  tags: () => ['vault', 'tags'] as const,
  trash: () => ['vault', 'trash'] as const,
}
