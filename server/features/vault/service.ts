import type {
  vaultEntries as vaultEntriesTable,
  vaultFolders as vaultFoldersTable,
  vaultTags as vaultTagsTable,
  workspaceVaultKeys as workspaceVaultKeysTable,
} from '../../database/schema'
import type { DatabaseClient } from '../../infrastructure/database/client'
import type { ItemService } from '../../infrastructure/database/item-service'
import { Buffer } from 'node:buffer'
import { and, asc, eq, ilike, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { createError } from 'h3'
import * as schema from '../../database/schema'
import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  unwrapDek,
} from './crypto'

/**
 * Vault service (T-V-14, REQ-VAULT-7..11).
 *
 * Owns CRUD over entries, folders, tags, and the entry/tag junction. All
 * methods that touch *encrypted* fields take a `masterKey` parameter
 * (32-byte buffer from the in-memory vault session, T-V-6) and unwrap the
 * workspace's DEK on demand. The DEK is zeroed before the method returns,
 * win or fail.
 *
 * Folder depth enforcement, delete-strategy semantics, and access-log
 * writes are intentionally **not** in this skeleton — they ship as
 * T-V-15 and T-V-19 respectively. The skeleton's job is the data shape +
 * encryption/decryption round-trip; the higher-level guards layer on top.
 *
 * Encrypted payload shape on disk (`vault_entries.payload`):
 *
 * ```
 * {
 *   "username": EncryptedBlob | null,
 *   "password": EncryptedBlob | null,
 *   "url":      EncryptedBlob | null,
 *   "notes":    EncryptedBlob | null,
 *   "customFields": [
 *     { "name": "...", "isSecret": true,  "value": EncryptedBlob },
 *     { "name": "...", "isSecret": false, "value": "<plaintext>" }
 *   ]
 * }
 * ```
 *
 * `EncryptedBlob` is `{ ct, iv, tag }` with each field base64. The blob
 * format is JSON-only — Postgres `jsonb` can't store binary. Custom
 * fields with `isSecret=false` are stored in plaintext so non-sensitive
 * structured values (an SSH host, a port number) don't pay encryption
 * overhead.
 */

type Tx = Parameters<Parameters<DatabaseClient['transaction']>[0]>[0]

export interface EncryptedBlob {
  ct: string // base64
  iv: string
  tag: string
}

export interface CustomField {
  name: string
  isSecret: boolean
  /** Plaintext value as the user typed it. */
  value: string
}

export interface PlainEntryPayload {
  username: string | null
  password: string | null
  url: string | null
  notes: string | null
  customFields: CustomField[]
}

export interface StoredCustomField {
  name: string
  isSecret: boolean
  /** Encrypted blob if `isSecret`, else plaintext string. */
  value: EncryptedBlob | string
}

export interface StoredEntryPayload {
  username: EncryptedBlob | null
  password: EncryptedBlob | null
  url: EncryptedBlob | null
  notes: EncryptedBlob | null
  customFields: StoredCustomField[]
}

const toBase64 = (buf: Buffer): string => buf.toString('base64')
const fromBase64 = (s: string): Buffer => Buffer.from(s, 'base64')

const encryptString = (plaintext: string, dek: Buffer): EncryptedBlob => {
  const { ct, iv, tag } = aesGcmEncrypt(Buffer.from(plaintext, 'utf8'), dek)
  return { ct: toBase64(ct), iv: toBase64(iv), tag: toBase64(tag) }
}

const decryptString = (blob: EncryptedBlob, dek: Buffer): string => {
  const buf = aesGcmDecrypt(
    { ct: fromBase64(blob.ct), iv: fromBase64(blob.iv), tag: fromBase64(blob.tag) },
    dek,
  )
  return buf.toString('utf8')
}

export const encryptEntryPayload = (
  plain: PlainEntryPayload,
  dek: Buffer,
): StoredEntryPayload => ({
  username: plain.username === null ? null : encryptString(plain.username, dek),
  password: plain.password === null ? null : encryptString(plain.password, dek),
  url: plain.url === null ? null : encryptString(plain.url, dek),
  notes: plain.notes === null ? null : encryptString(plain.notes, dek),
  customFields: plain.customFields.map(f => ({
    name: f.name,
    isSecret: f.isSecret,
    value: f.isSecret ? encryptString(f.value, dek) : f.value,
  })),
})

export const decryptEntryPayload = (
  stored: StoredEntryPayload,
  dek: Buffer,
): PlainEntryPayload => ({
  username: stored.username === null ? null : decryptString(stored.username, dek),
  password: stored.password === null ? null : decryptString(stored.password, dek),
  url: stored.url === null ? null : decryptString(stored.url, dek),
  notes: stored.notes === null ? null : decryptString(stored.notes, dek),
  customFields: stored.customFields.map((f) => {
    if (f.isSecret) {
      if (typeof f.value === 'string') {
        throw new TypeError('vault: custom field marked secret but stored as plaintext')
      }
      return { name: f.name, isSecret: true, value: decryptString(f.value, dek) }
    }
    if (typeof f.value !== 'string') {
      throw new TypeError('vault: non-secret custom field stored as encrypted blob')
    }
    return { name: f.name, isSecret: false, value: f.value }
  }),
})

export interface CreateVaultServiceDeps {
  db: DatabaseClient
  vaultEntriesItemService: ItemService<typeof vaultEntriesTable>
  vaultFoldersItemService: ItemService<typeof vaultFoldersTable>
  vaultTagsItemService: ItemService<typeof vaultTagsTable>
  workspaceVaultKeysItemService: ItemService<typeof workspaceVaultKeysTable>
}

export const createVaultService = (deps: CreateVaultServiceDeps) => {
  const {
    db,
    vaultEntriesItemService,
    vaultFoldersItemService,
    vaultTagsItemService,
    workspaceVaultKeysItemService,
  } = deps

  /**
   * Unwrap the workspace DEK. Caller MUST zero the returned buffer when done
   * (`buf.fill(0)`). Throws if the workspace has no provisioned vault.
   */
  const unwrapWorkspaceDek = async (
    organisationId: string,
    masterKey: Buffer,
  ): Promise<Buffer> => {
    const row = await workspaceVaultKeysItemService.findOne({ organisationId })
    if (!row) {
      throw createError({ statusCode: 412, statusMessage: 'vault.workspace_not_initialised' })
    }
    return unwrapDek(
      { wrappedDek: row.wrappedDek, iv: row.wrapIv, tag: row.wrapTag },
      masterKey,
      row.workspaceSalt,
    )
  }

  /**
   * Case-insensitive find-or-create. Tag names are unique per workspace
   * (DESIGN-VAULT-DATA, REQ-VAULT-10). Defined ahead of `resolveTagRows`
   * so the latter can reference it without hoisting through closures.
   */
  const findOrCreateTag = async (input: { organisationId: string, name: string }) => {
    const trimmed = input.name.trim()
    if (!trimmed) {
      throw createError({ statusCode: 400, statusMessage: 'vault.tag.empty_name' })
    }

    const [existing] = await db
      .select()
      .from(schema.vaultTags)
      .where(
        and(
          eq(schema.vaultTags.organisationId, input.organisationId),
          sql`lower(${schema.vaultTags.name}) = lower(${trimmed})`,
        ),
      )
      .limit(1)

    if (existing)
      return existing

    return vaultTagsItemService.create({
      organisationId: input.organisationId,
      name: trimmed,
    })
  }

  /** Resolve a list of tag names into rows, creating any that don't exist. */
  const resolveTagRows = async (organisationId: string, tagNames: string[]) => {
    const uniqueNames = Array.from(
      new Map(tagNames.map(n => [n.trim().toLowerCase(), n.trim()] as const)).values(),
    ).filter(n => n.length > 0)

    if (uniqueNames.length === 0)
      return []

    return Promise.all(
      uniqueNames.map(name => findOrCreateTag({ organisationId, name })),
    )
  }

  // ---------------------------------------------------------------------
  // Folders (skeleton — T-V-15 layers on depth check + delete strategy)
  // ---------------------------------------------------------------------

  const createFolder = async (input: {
    organisationId: string
    name: string
    parentId?: string | null
  }) => vaultFoldersItemService.create({
    organisationId: input.organisationId,
    name: input.name,
    parentId: input.parentId ?? null,
  })

  const updateFolder = async (
    id: string,
    patch: Partial<{ name: string, parentId: string | null }>,
  ) => vaultFoldersItemService.update(id, patch)

  const listFolders = async (input: { organisationId: string }) =>
    vaultFoldersItemService.findMany({
      filter: { organisationId: input.organisationId, deletedAt: { _null: true } },
      sort: ['name'],
    })

  const findFolderById = async (id: string) => vaultFoldersItemService.readOne(id)

  const softDeleteFolder = async (id: string) =>
    vaultFoldersItemService.update(id, { deletedAt: new Date() })

  // ---------------------------------------------------------------------
  // Tags
  // ---------------------------------------------------------------------

  const listTags = async (input: { organisationId: string }) =>
    vaultTagsItemService.findMany({
      filter: { organisationId: input.organisationId },
      sort: ['name'],
    })

  const removeTag = async (id: string) => vaultTagsItemService.delete(id)

  /**
   * Idempotent attach. Composite-PK insert; `ON CONFLICT DO NOTHING` semantics
   *  via a pre-check, since the junction doesn't surface a clean upsert path.
   */
  const attachTag = async (input: { entryId: string, tagId: string }) => {
    const [existing] = await db
      .select()
      .from(schema.vaultEntryTags)
      .where(
        and(
          eq(schema.vaultEntryTags.entryId, input.entryId),
          eq(schema.vaultEntryTags.tagId, input.tagId),
        ),
      )
      .limit(1)
    if (existing)
      return existing

    const [row] = await db
      .insert(schema.vaultEntryTags)
      .values({ entryId: input.entryId, tagId: input.tagId })
      .returning()
    return row
  }

  const detachTag = async (input: { entryId: string, tagId: string }) => {
    await db
      .delete(schema.vaultEntryTags)
      .where(
        and(
          eq(schema.vaultEntryTags.entryId, input.entryId),
          eq(schema.vaultEntryTags.tagId, input.tagId),
        ),
      )
  }

  /** Replace the tag set for an entry inside an existing transaction. */
  const rewriteEntryTags = async (
    tx: Tx,
    entryId: string,
    tagIds: string[],
  ) => {
    await tx.delete(schema.vaultEntryTags).where(eq(schema.vaultEntryTags.entryId, entryId))
    if (tagIds.length > 0) {
      await tx.insert(schema.vaultEntryTags).values(
        tagIds.map(tagId => ({ entryId, tagId })),
      )
    }
  }

  // ---------------------------------------------------------------------
  // Entries
  // ---------------------------------------------------------------------

  const createEntry = async (input: {
    organisationId: string
    masterKey: Buffer
    title: string
    folderId?: string | null
    payload: PlainEntryPayload
    tagNames?: string[]
    createdBy?: string | null
  }) => {
    const dek = await unwrapWorkspaceDek(input.organisationId, input.masterKey)
    try {
      const stored = encryptEntryPayload(input.payload, dek)
      const tagRows = input.tagNames && input.tagNames.length > 0
        ? await resolveTagRows(input.organisationId, input.tagNames)
        : []

      return await db.transaction(async (tx) => {
        const created = await vaultEntriesItemService.create({
          organisationId: input.organisationId,
          folderId: input.folderId ?? null,
          title: input.title,
          payload: stored,
          createdBy: input.createdBy ?? null,
        })
        if (tagRows.length > 0)
          await rewriteEntryTags(tx, created.id, tagRows.map(t => t.id))
        return created
      })
    }
    finally {
      dek.fill(0)
    }
  }

  const updateEntry = async (input: {
    id: string
    organisationId: string
    masterKey: Buffer
    patch: Partial<{
      title: string
      folderId: string | null
      payload: PlainEntryPayload
      tagNames: string[]
    }>
  }) => {
    const existing = await vaultEntriesItemService.readOne(input.id)
    if (!existing || existing.organisationId !== input.organisationId) {
      throw createError({ statusCode: 404, statusMessage: 'vault.entry.not_found' })
    }

    let storedPayload: StoredEntryPayload | undefined
    if (input.patch.payload !== undefined) {
      const dek = await unwrapWorkspaceDek(input.organisationId, input.masterKey)
      try {
        storedPayload = encryptEntryPayload(input.patch.payload, dek)
      }
      finally {
        dek.fill(0)
      }
    }

    const tagRows = input.patch.tagNames !== undefined
      ? await resolveTagRows(input.organisationId, input.patch.tagNames)
      : null

    return db.transaction(async (tx) => {
      const data: Record<string, unknown> = {}
      if (input.patch.title !== undefined)
        data.title = input.patch.title
      if (input.patch.folderId !== undefined)
        data.folderId = input.patch.folderId
      if (storedPayload !== undefined)
        data.payload = storedPayload

      let row = existing
      if (Object.keys(data).length > 0) {
        const [updated] = await tx
          .update(schema.vaultEntries)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(schema.vaultEntries.id, input.id))
          .returning()
        if (!updated) {
          throw createError({ statusCode: 404, statusMessage: 'vault.entry.not_found' })
        }
        row = updated
      }

      if (tagRows !== null)
        await rewriteEntryTags(tx, input.id, tagRows.map(t => t.id))

      return row
    })
  }

  /** Fetch an entry and decrypt its payload. */
  const getEntry = async (input: {
    id: string
    organisationId: string
    masterKey: Buffer
    includeDeleted?: boolean
  }): Promise<{
    entry: typeof schema.vaultEntries.$inferSelect
    payload: PlainEntryPayload
  } | null> => {
    const row = await vaultEntriesItemService.readOne(input.id)
    if (!row || row.organisationId !== input.organisationId)
      return null
    if (row.deletedAt !== null && !input.includeDeleted)
      return null

    const dek = await unwrapWorkspaceDek(input.organisationId, input.masterKey)
    try {
      const payload = decryptEntryPayload(row.payload as StoredEntryPayload, dek)
      return { entry: row, payload }
    }
    finally {
      dek.fill(0)
    }
  }

  /**
   * List entries by workspace, optionally filtered by folder, tag, or
   * case-insensitive title substring. Does NOT decrypt — list views need
   * metadata (title is plaintext per ADR-019). Soft-deleted excluded by
   * default.
   */
  const listEntries = async (input: {
    organisationId: string
    folderId?: string | null
    tagId?: string
    query?: string
    includeDeleted?: boolean
    limit?: number
    offset?: number
  }) => {
    const conditions = [eq(schema.vaultEntries.organisationId, input.organisationId)]

    if (!input.includeDeleted)
      conditions.push(isNull(schema.vaultEntries.deletedAt))

    if (input.folderId !== undefined) {
      conditions.push(input.folderId === null
        ? isNull(schema.vaultEntries.folderId)
        : eq(schema.vaultEntries.folderId, input.folderId))
    }

    if (input.tagId) {
      const tagged = db
        .select({ id: schema.vaultEntryTags.entryId })
        .from(schema.vaultEntryTags)
        .where(eq(schema.vaultEntryTags.tagId, input.tagId))
      conditions.push(inArray(schema.vaultEntries.id, tagged))
    }

    if (input.query) {
      const trimmed = input.query.trim()
      if (trimmed.length > 0)
        conditions.push(ilike(schema.vaultEntries.title, `%${trimmed}%`))
    }

    let query = db
      .select()
      .from(schema.vaultEntries)
      .where(and(...conditions))
      .orderBy(asc(schema.vaultEntries.title))
      .$dynamic()
    if (input.limit !== undefined)
      query = query.limit(input.limit)
    if (input.offset !== undefined)
      query = query.offset(input.offset)

    return query
  }

  /** List soft-deleted entries (Trash view). */
  const listTrash = async (input: { organisationId: string }) => {
    return db
      .select()
      .from(schema.vaultEntries)
      .where(and(
        eq(schema.vaultEntries.organisationId, input.organisationId),
        isNotNull(schema.vaultEntries.deletedAt),
      ))
      .orderBy(asc(schema.vaultEntries.title))
  }

  const softDeleteEntry = async (input: { id: string, organisationId: string }) => {
    const existing = await vaultEntriesItemService.readOne(input.id)
    if (!existing || existing.organisationId !== input.organisationId) {
      throw createError({ statusCode: 404, statusMessage: 'vault.entry.not_found' })
    }
    return vaultEntriesItemService.update(input.id, { deletedAt: new Date() })
  }

  const restoreEntry = async (input: { id: string, organisationId: string }) => {
    const existing = await vaultEntriesItemService.readOne(input.id)
    if (!existing || existing.organisationId !== input.organisationId) {
      throw createError({ statusCode: 404, statusMessage: 'vault.entry.not_found' })
    }
    return vaultEntriesItemService.update(input.id, { deletedAt: null })
  }

  /**
   * Hard-delete an entry. Only callable from the Trash UI (REQ-VAULT-8); the
   * runtime guard requires the entry to be already soft-deleted.
   */
  const purgeEntry = async (input: { id: string, organisationId: string }) => {
    const existing = await vaultEntriesItemService.readOne(input.id)
    if (!existing || existing.organisationId !== input.organisationId) {
      throw createError({ statusCode: 404, statusMessage: 'vault.entry.not_found' })
    }
    if (existing.deletedAt === null) {
      throw createError({ statusCode: 400, statusMessage: 'vault.entry.purge_active_forbidden' })
    }
    await db.delete(schema.vaultEntries).where(eq(schema.vaultEntries.id, input.id))
  }

  /**
   * Duplicate an entry: read+decrypt the source, re-encrypt with the same
   * DEK (works because workspace is the same), and clone all tag links. The
   * title is suffixed with " (Copy)" per REQ-VAULT-8.
   */
  const duplicateEntry = async (input: {
    id: string
    organisationId: string
    masterKey: Buffer
    createdBy?: string | null
  }) => {
    const source = await getEntry({
      id: input.id,
      organisationId: input.organisationId,
      masterKey: input.masterKey,
    })
    if (!source) {
      throw createError({ statusCode: 404, statusMessage: 'vault.entry.not_found' })
    }

    // Carry over tag links via the junction. We don't re-resolve names — the
    // source's tags already exist as rows.
    const sourceTagLinks = await db
      .select({ tagId: schema.vaultEntryTags.tagId })
      .from(schema.vaultEntryTags)
      .where(eq(schema.vaultEntryTags.entryId, input.id))

    const dek = await unwrapWorkspaceDek(input.organisationId, input.masterKey)
    try {
      const stored = encryptEntryPayload(source.payload, dek)

      return await db.transaction(async (tx) => {
        const created = await vaultEntriesItemService.create({
          organisationId: input.organisationId,
          folderId: source.entry.folderId,
          title: `${source.entry.title} (Copy)`,
          payload: stored,
          createdBy: input.createdBy ?? null,
        })
        if (sourceTagLinks.length > 0) {
          await rewriteEntryTags(tx, created.id, sourceTagLinks.map(l => l.tagId))
        }
        return created
      })
    }
    finally {
      dek.fill(0)
    }
  }

  return {
    // Folders
    createFolder,
    updateFolder,
    listFolders,
    findFolderById,
    softDeleteFolder,

    // Tags
    findOrCreateTag,
    listTags,
    removeTag,
    attachTag,
    detachTag,

    // Entries
    createEntry,
    updateEntry,
    getEntry,
    listEntries,
    listTrash,
    softDeleteEntry,
    restoreEntry,
    purgeEntry,
    duplicateEntry,
  }
}

export type VaultService = ReturnType<typeof createVaultService>
