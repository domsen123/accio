import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import * as schema from '../server/database/schema'
import {
  generateDek,
  generateSalt,
  wrapDek,
} from '../server/features/vault/crypto'
import {
  createVaultService,
  decryptEntryPayload,
  encryptEntryPayload,
} from '../server/features/vault/service'
import { getDatabase } from '../server/infrastructure/database/client'
import { createItemService } from '../server/infrastructure/database/item-service'

import { createOrganisationData } from './factories'

const db = getDatabase('app')

const organisationsItemService = createItemService({ db, table: schema.organisations, tableName: 'organisations' })
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

// Provision a workspace + a wrapped DEK so the service has something to
// unwrap. We bypass /api/vault/* and the master-password Argon2 cost by
// using a random 32-byte buffer as the "master key" directly — the
// service only cares that the wrapping key is reproducible from
// (masterKey, workspaceSalt).
const setupWorkspace = async () => {
  const org = await organisationsItemService.create(createOrganisationData())
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
  return { orgId: org.id, masterKey }
}

const samplePayload = (overrides: Record<string, unknown> = {}) => ({
  username: 'alice',
  password: 'hunter2',
  url: 'https://example.com',
  notes: null,
  customFields: [
    { name: 'token', isSecret: true, value: 't0p-s3cr3t' },
    { name: 'host', isSecret: false, value: 'ssh.example.com' },
  ],
  ...overrides,
})

describe('vault payload encryption helpers', () => {
  it('round-trips a payload through encrypt + decrypt with the same DEK', () => {
    const dek = generateDek()
    const stored = encryptEntryPayload(samplePayload(), dek)
    const back = decryptEntryPayload(stored, dek)
    expect(back).toEqual(samplePayload())
    dek.fill(0)
  })

  it('marks each encrypted field as a base64 blob with non-overlapping IVs', () => {
    const dek = generateDek()
    const stored = encryptEntryPayload(samplePayload(), dek)
    expect(stored.username?.iv).toMatch(/^[\w+/=]+$/)
    expect(stored.password?.iv).not.toBe(stored.username?.iv)
    dek.fill(0)
  })

  it('keeps non-secret custom fields as plaintext on disk', () => {
    const dek = generateDek()
    const stored = encryptEntryPayload(samplePayload(), dek)
    const host = stored.customFields.find(f => f.name === 'host')
    expect(host?.value).toBe('ssh.example.com')
    dek.fill(0)
  })

  it('refuses decrypt with the wrong DEK', () => {
    const dek = generateDek()
    const stored = encryptEntryPayload(samplePayload(), dek)
    const wrongDek = generateDek()
    expect(() => decryptEntryPayload(stored, wrongDek)).toThrow()
    dek.fill(0)
    wrongDek.fill(0)
  })
})

describe('vaultService.createEntry / getEntry', () => {
  it('persists an encrypted payload and round-trips it on read', async () => {
    const { orgId, masterKey } = await setupWorkspace()

    const entry = await vaultService.createEntry({
      organisationId: orgId,
      masterKey,
      title: 'Example login',
      payload: samplePayload(),
    })

    // Raw row → ciphertext only, no plaintext password leak.
    const [raw] = await db.select().from(schema.vaultEntries).where(eq(schema.vaultEntries.id, entry.id))
    expect(raw).toBeDefined()
    expect(JSON.stringify(raw.payload)).not.toContain('hunter2')

    const fetched = await vaultService.getEntry({
      id: entry.id,
      organisationId: orgId,
      masterKey,
    })
    expect(fetched).not.toBeNull()
    expect(fetched!.payload.password).toBe('hunter2')
    expect(fetched!.payload.customFields[0].value).toBe('t0p-s3cr3t')
    expect(fetched!.entry.title).toBe('Example login')
  })

  it('refuses to decrypt across a different workspace', async () => {
    const a = await setupWorkspace()
    const b = await setupWorkspace()

    const entry = await vaultService.createEntry({
      organisationId: a.orgId,
      masterKey: a.masterKey,
      title: 'Login',
      payload: samplePayload(),
    })

    await expect(
      vaultService.getEntry({ id: entry.id, organisationId: b.orgId, masterKey: b.masterKey }),
    ).resolves.toBeNull() // org mismatch returns null before crypto runs

    // And even if we tried to decrypt with the wrong workspace's key, the
    // wrapped DEK on workspace B is different — using B's masterKey on A's
    // entry would unwrap a different DEK and authentication would fail.
    await expect(
      vaultService.getEntry({ id: entry.id, organisationId: a.orgId, masterKey: b.masterKey }),
    ).rejects.toThrow()
  })

  it('refuses to operate when the workspace has no vault provisioned', async () => {
    const org = await organisationsItemService.create(createOrganisationData())
    const masterKey = randomBytes(32)
    await expect(
      vaultService.createEntry({
        organisationId: org.id,
        masterKey,
        title: 'x',
        payload: samplePayload(),
      }),
    ).rejects.toMatchObject({ statusCode: 412 })
    masterKey.fill(0)
  })
})

describe('vaultService.updateEntry', () => {
  it('replaces the payload and tag set on update', async () => {
    const { orgId, masterKey } = await setupWorkspace()
    const entry = await vaultService.createEntry({
      organisationId: orgId,
      masterKey,
      title: 'Login',
      payload: samplePayload(),
      tagNames: ['Work', 'AWS'],
    })

    await vaultService.updateEntry({
      id: entry.id,
      organisationId: orgId,
      masterKey,
      patch: {
        title: 'Login (renamed)',
        payload: samplePayload({ password: 'newpass' }),
        tagNames: ['Personal'],
      },
    })

    const fetched = await vaultService.getEntry({
      id: entry.id,
      organisationId: orgId,
      masterKey,
    })
    expect(fetched!.entry.title).toBe('Login (renamed)')
    expect(fetched!.payload.password).toBe('newpass')

    const links = await db
      .select()
      .from(schema.vaultEntryTags)
      .where(eq(schema.vaultEntryTags.entryId, entry.id))
    const tagIds = links.map(l => l.tagId)
    const tagRows = tagIds.length === 0
      ? []
      : await db
          .select()
          .from(schema.vaultTags)
          .where(eq(schema.vaultTags.id, tagIds[0]))
    expect(tagRows.map(t => t.name)).toEqual(['Personal'])
  })
})

describe('vaultService listing + folder + tag attach/detach', () => {
  it('lists entries by folder and by tag', async () => {
    const { orgId, masterKey } = await setupWorkspace()

    const folder = await vaultService.createFolder({
      organisationId: orgId,
      name: 'Work',
    })

    const a = await vaultService.createEntry({
      organisationId: orgId,
      masterKey,
      title: 'AWS',
      folderId: folder.id,
      payload: samplePayload(),
    })
    await vaultService.createEntry({
      organisationId: orgId,
      masterKey,
      title: 'Github',
      payload: samplePayload(),
    })

    const inFolder = await vaultService.listEntries({
      organisationId: orgId,
      folderId: folder.id,
    })
    expect(inFolder.map(e => e.id)).toEqual([a.id])

    const tag = await vaultService.findOrCreateTag({ organisationId: orgId, name: 'aws' })
    await vaultService.attachTag({ entryId: a.id, tagId: tag.id })

    const tagged = await vaultService.listEntries({
      organisationId: orgId,
      tagId: tag.id,
    })
    expect(tagged.map(e => e.id)).toEqual([a.id])

    await vaultService.detachTag({ entryId: a.id, tagId: tag.id })
    const taggedAfter = await vaultService.listEntries({
      organisationId: orgId,
      tagId: tag.id,
    })
    expect(taggedAfter).toHaveLength(0)
  })

  it('finds existing tags case-insensitively', async () => {
    const { orgId } = await setupWorkspace()
    const a = await vaultService.findOrCreateTag({ organisationId: orgId, name: 'AWS' })
    const b = await vaultService.findOrCreateTag({ organisationId: orgId, name: 'aws' })
    expect(b.id).toBe(a.id)
  })
})

describe('vaultService soft delete + restore + duplicate', () => {
  it('soft-deletes, restores, and lists trash', async () => {
    const { orgId, masterKey } = await setupWorkspace()
    const entry = await vaultService.createEntry({
      organisationId: orgId,
      masterKey,
      title: 'doomed',
      payload: samplePayload(),
    })

    await vaultService.softDeleteEntry({ id: entry.id, organisationId: orgId })

    const list = await vaultService.listEntries({ organisationId: orgId })
    expect(list.find(e => e.id === entry.id)).toBeUndefined()

    const trash = await vaultService.listTrash({ organisationId: orgId })
    expect(trash.map(e => e.id)).toEqual([entry.id])

    await vaultService.restoreEntry({ id: entry.id, organisationId: orgId })
    const live = await vaultService.listEntries({ organisationId: orgId })
    expect(live.map(e => e.id)).toEqual([entry.id])
  })

  it('duplicate copies payload and tag set with " (Copy)" suffix', async () => {
    const { orgId, masterKey } = await setupWorkspace()
    const tag = await vaultService.findOrCreateTag({ organisationId: orgId, name: 'work' })
    const source = await vaultService.createEntry({
      organisationId: orgId,
      masterKey,
      title: 'Original',
      payload: samplePayload(),
    })
    await vaultService.attachTag({ entryId: source.id, tagId: tag.id })

    const copy = await vaultService.duplicateEntry({
      id: source.id,
      organisationId: orgId,
      masterKey,
    })
    expect(copy.title).toBe('Original (Copy)')

    const decrypted = await vaultService.getEntry({
      id: copy.id,
      organisationId: orgId,
      masterKey,
    })
    expect(decrypted!.payload.password).toBe('hunter2')

    const links = await db
      .select()
      .from(schema.vaultEntryTags)
      .where(eq(schema.vaultEntryTags.entryId, copy.id))
    expect(links.map(l => l.tagId)).toEqual([tag.id])
  })
})

describe('vaultService.updateFolder (basic move)', () => {
  it('moves a folder by setting parentId', async () => {
    const { orgId } = await setupWorkspace()
    const parent = await vaultService.createFolder({ organisationId: orgId, name: 'A' })
    const child = await vaultService.createFolder({ organisationId: orgId, name: 'B' })

    await vaultService.updateFolder(child.id, { parentId: parent.id })

    const refetched = await vaultService.findFolderById(child.id)
    expect(refetched!.parentId).toBe(parent.id)
  })
})

describe('vaultService title substring search', () => {
  it('matches case-insensitively', async () => {
    const { orgId, masterKey } = await setupWorkspace()
    await vaultService.createEntry({
      organisationId: orgId,
      masterKey,
      title: 'GitHub Personal',
      payload: samplePayload(),
    })
    await vaultService.createEntry({
      organisationId: orgId,
      masterKey,
      title: 'AWS Production',
      payload: samplePayload(),
    })

    const hits = await vaultService.listEntries({ organisationId: orgId, query: 'github' })
    expect(hits).toHaveLength(1)
    expect(hits[0].title).toBe('GitHub Personal')
  })
})
