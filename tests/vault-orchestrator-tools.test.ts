// Tests for the orchestrator vault tools (T-V-20, T-V-21).
//
// `vault_search` is a metadata-only read tool. `vault_get_secret` is
// confirm-class and reveals a single field after the user clicks
// confirm in chat. Both honour the in-memory vault session and refuse
// when the vault is locked.

import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import * as schema from '../server/database/schema'
import { createVaultGetSecretTool } from '../server/features/orchestrator/tools/vault-get-secret'
import { createVaultSearchTool } from '../server/features/orchestrator/tools/vault-search'
import {
  generateDek,
  generateSalt,
  wrapDek,
} from '../server/features/vault/crypto'
import { createVaultService } from '../server/features/vault/service'
import { createVaultSessionStore } from '../server/features/vault/session-store'

import { getDatabase } from '../server/infrastructure/database/client'
import { createItemService } from '../server/infrastructure/database/item-service'
import { createOrganisationData, createUserData } from './factories'

const db = getDatabase('app')

const organisationsItemService = createItemService({ db, table: schema.organisations, tableName: 'organisations' })
const usersItemService = createItemService({ db, table: schema.users, tableName: 'users' })
const vaultEntriesItemService = createItemService({ db, table: schema.vaultEntries, tableName: 'vaultEntries' })
const vaultFoldersItemService = createItemService({ db, table: schema.vaultFolders, tableName: 'vaultFolders' })
const vaultTagsItemService = createItemService({ db, table: schema.vaultTags, tableName: 'vaultTags' })
const workspaceVaultKeysItemService = createItemService({ db, table: schema.workspaceVaultKeys, tableName: 'workspaceVaultKeys' })

const vaultService = createVaultService({
  db,
  vaultEntriesItemService,
  vaultFoldersItemService,
  vaultTagsItemService,
  workspaceVaultKeysItemService,
})

const seed = async () => {
  const org = await organisationsItemService.create(createOrganisationData())
  const user = await usersItemService.create(createUserData())
  const masterKey = randomBytes(32)
  const workspaceSalt = generateSalt()
  const dek = generateDek()
  const wrapped = wrapDek(dek, masterKey, workspaceSalt)
  await workspaceVaultKeysItemService.create({
    organisationId: org.id,
    workspaceSalt,
    wrappedDek: wrapped.wrappedDek,
    wrapIv: wrapped.iv,
    wrapTag: wrapped.tag,
  })
  dek.fill(0)
  const sessionId = `sess_${randomBytes(8).toString('hex')}`
  return { orgId: org.id, userId: user.id, sessionId, masterKey }
}

describe('vault_search tool', () => {
  it('returns metadata-only results when the vault is unlocked', async () => {
    const { orgId, userId, sessionId, masterKey } = await seed()
    const store = createVaultSessionStore()
    store.createSession({ userId, sessionId, masterKey })

    const folder = await vaultService.createFolder({
      organisationId: orgId,
      name: 'Work',
    })
    await vaultService.createEntry({
      organisationId: orgId,
      masterKey,
      title: 'GitHub',
      folderId: folder.id,
      payload: {
        username: 'alice',
        password: 'secret',
        url: null,
        notes: null,
        customFields: [{ name: 'token', isSecret: true, value: 't' }],
      },
    })

    const tool = createVaultSearchTool({ vaultService, vaultSessionStore: store })
    const result = await tool.handler(
      { query: 'gith', limit: 10 },
      { userId, sessionId, organisationId: orgId, mode: 'read_only' },
    )
    expect('results' in result).toBe(true)
    if ('results' in result) {
      expect(result.results).toHaveLength(1)
      expect(result.results[0].title).toBe('GitHub')
      expect(result.results[0].folder_path).toBe('Work')
      expect(result.results[0].has_username).toBe(true)
      expect(result.results[0].has_password).toBe(true)
      expect(result.results[0].custom_field_names).toContain('token')
      // Crucial: no plaintext leaks.
      expect(JSON.stringify(result)).not.toContain('alice')
      expect(JSON.stringify(result)).not.toContain('secret')
    }

    // Access-log entry was written.
    const logs = await db
      .select()
      .from(schema.vaultAccessLog)
      .where(eq(schema.vaultAccessLog.organisationId, orgId))
    expect(logs).toHaveLength(1)
    expect(logs[0].eventType).toBe('orchestrator_search')

    store.stop()
  })

  it('returns vault_locked when the session is missing', async () => {
    const { orgId, userId, sessionId } = await seed()
    const store = createVaultSessionStore()
    // No createSession — the vault is "locked".

    const tool = createVaultSearchTool({ vaultService, vaultSessionStore: store })
    const result = await tool.handler(
      { query: 'github' },
      { userId, sessionId, organisationId: orgId, mode: 'read_only' },
    )
    expect(result).toEqual({ error: 'vault_locked' })

    // No log row written for a locked-vault probe.
    const logs = await db
      .select()
      .from(schema.vaultAccessLog)
      .where(eq(schema.vaultAccessLog.organisationId, orgId))
    expect(logs).toHaveLength(0)

    store.stop()
  })

  it('returns permission_denied when sessionId is missing on the context', async () => {
    const { orgId, userId } = await seed()
    const store = createVaultSessionStore()
    const tool = createVaultSearchTool({ vaultService, vaultSessionStore: store })
    const result = await tool.handler(
      { query: 'x' },
      { userId, organisationId: orgId, mode: 'read_only' },
    )
    expect(result).toEqual({ error: 'permission_denied' })
    store.stop()
  })
})

describe('vault_get_secret tool', () => {
  it('returns the requested field when unlocked', async () => {
    const { orgId, userId, sessionId, masterKey } = await seed()
    const store = createVaultSessionStore()
    store.createSession({ userId, sessionId, masterKey })

    const entry = await vaultService.createEntry({
      organisationId: orgId,
      masterKey,
      title: 'Login',
      payload: {
        username: 'alice',
        password: 'hunter2',
        url: null,
        notes: 'Admin server',
        customFields: [{ name: 'token', isSecret: true, value: 't0p-s3cr3t' }],
      },
    })

    const tool = createVaultGetSecretTool({ vaultService, vaultSessionStore: store })
    const result = await tool.handler(
      { entry_id: entry.id, field: 'password', reason: 'verify deploy creds' },
      { userId, sessionId, organisationId: orgId, mode: 'read_only' },
    )
    expect(result).toEqual({ value: 'hunter2' })

    const logs = await db
      .select()
      .from(schema.vaultAccessLog)
      .where(eq(schema.vaultAccessLog.organisationId, orgId))
    expect(logs).toHaveLength(1)
    expect(logs[0].eventType).toBe('orchestrator_reveal')
    expect(logs[0].fieldName).toBe('password')
    expect(logs[0].reason).toBe('verify deploy creds')

    // Custom field via `custom:<name>`.
    const customResult = await tool.handler(
      { entry_id: entry.id, field: 'custom:token', reason: 'deploy hook' },
      { userId, sessionId, organisationId: orgId, mode: 'read_only' },
    )
    expect(customResult).toEqual({ value: 't0p-s3cr3t' })

    store.stop()
  })

  it('returns vault_locked when the session is missing', async () => {
    const { orgId, userId, sessionId, masterKey } = await seed()
    const store = createVaultSessionStore()

    // Create entry while we still have the master key, but don't create a session.
    const entry = await vaultService.createEntry({
      organisationId: orgId,
      masterKey,
      title: 'Login',
      payload: {
        username: 'a',
        password: 'p',
        url: null,
        notes: null,
        customFields: [],
      },
    })

    const tool = createVaultGetSecretTool({ vaultService, vaultSessionStore: store })
    const result = await tool.handler(
      { entry_id: entry.id, field: 'password', reason: 'r' },
      { userId, sessionId, organisationId: orgId, mode: 'read_only' },
    )
    expect(result).toEqual({ error: 'vault_locked' })

    store.stop()
  })

  it('returns entry_not_found for a foreign or missing id', async () => {
    const { orgId, userId, sessionId, masterKey } = await seed()
    const store = createVaultSessionStore()
    store.createSession({ userId, sessionId, masterKey })
    const tool = createVaultGetSecretTool({ vaultService, vaultSessionStore: store })

    const result = await tool.handler(
      { entry_id: '01ZZZZZZZZZZZZZZZZZZZZZZZZ', field: 'password', reason: 'x' },
      { userId, sessionId, organisationId: orgId, mode: 'read_only' },
    )
    expect(result).toEqual({ error: 'entry_not_found' })
    store.stop()
  })
})
