/**
 * POST /api/vault/workspace/init — provision a workspace-scoped vault
 * (T-V-8, REQ-VAULT-2).
 *
 * The user must already have set their master password (T-V-7). We verify
 * the submitted password against the per-user verifier, then derive the
 * master key, generate a fresh DEK + workspace salt, wrap the DEK, and
 * persist the row. Idempotency is enforced via the unique index on
 * `workspace_vault_keys.organisation_id`.
 *
 * This endpoint does NOT unlock the vault — see T-V-9 (`/api/vault/unlock`).
 */
import { z } from 'zod'
import { resolveWorkspace } from '~~/server/features/kb/workspace'
import { PERMISSIONS } from '~~/server/features/rbac/permissions'
import { requirePermission } from '~~/server/features/rbac/rbac.guard'
import {
  argon2idDeriveKey,
  generateDek,
  generateSalt,
  verifyMasterPassword,
  wrapDek,
} from '~~/server/features/vault/crypto'
import { container } from '~~/server/utils/container'

const schema = z.object({ masterPassword: z.string().min(1) })

export default defineEventHandler(async (event) => {
  if (!event.context.user)
    throw createError({ statusCode: 401, statusMessage: 'auth.unauthenticated' })

  const ws = await resolveWorkspace(event)

  await requirePermission(event, {
    permission: PERMISSIONS.VAULT_WRITE,
    scope: 'organisation',
    getScopeId: () => ws.organisationId,
  })

  const { masterPassword } = await readValidatedBody(event, body => schema.parse(body))

  const creds = await container.items.userVaultCredentials.findOne({
    userId: event.context.user.id,
  })
  if (!creds) {
    throw createError({
      statusCode: 412,
      statusMessage: 'vault.workspace_init.master_password_not_set',
    })
  }

  const ok = await verifyMasterPassword(masterPassword, creds.masterSalt, creds.masterVerifier)
  if (!ok) {
    throw createError({
      statusCode: 401,
      statusMessage: 'vault.workspace_init.invalid_password',
    })
  }

  const existing = await container.items.workspaceVaultKeys.findOne({
    organisationId: ws.organisationId,
  })
  if (existing) {
    throw createError({
      statusCode: 409,
      statusMessage: 'vault.workspace_init.already_initialised',
    })
  }

  const masterKey = await argon2idDeriveKey(masterPassword, creds.masterKdfSalt)
  const dek = generateDek()
  try {
    const workspaceSalt = generateSalt()
    const wrapped = wrapDek(dek, masterKey, workspaceSalt)

    await container.items.workspaceVaultKeys.create({
      organisationId: ws.organisationId,
      workspaceSalt,
      wrappedDek: wrapped.wrappedDek,
      wrapIv: wrapped.iv,
      wrapTag: wrapped.tag,
    })
  }
  finally {
    dek.fill(0)
    masterKey.fill(0)
  }

  return { ok: true }
})
