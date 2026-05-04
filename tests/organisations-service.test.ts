import { describe, expect, it } from 'vitest'

import * as schema from '../server/database/schema'
import { createOrganisationMembersService } from '../server/features/organisation-members/organisation-members.service'
import { createOrganisationsService } from '../server/features/organisations/organisations.service'
import { seedRbac } from '../server/features/rbac/rbac.seed'
import { createRbacService } from '../server/features/rbac/rbac.service'
import { getDatabase } from '../server/infrastructure/database/client'
import { createItemService } from '../server/infrastructure/database/item-service'

import { createUserData } from './factories'

// T-0.5 / DESIGN-CRYPTO: organisations.crypto_salt is generated on create.
describe('organisationsService.create', () => {
  const db = getDatabase('app')

  const usersItemService = createItemService({ db, table: schema.users, tableName: 'users' })
  const organisationsItemService = createItemService({ db, table: schema.organisations, tableName: 'organisations' })
  const rolesItemService = createItemService({ db, table: schema.roles, tableName: 'roles' })
  const rolePermissionsItemService = createItemService({ db, table: schema.rolePermissions, tableName: 'rolePermissions' })
  const userRolesItemService = createItemService({ db, table: schema.userRoles, tableName: 'userRoles' })
  const organisationMembersItemService = createItemService({ db, table: schema.organisationMembers, tableName: 'organisationMembers' })

  const rbacService = createRbacService({
    rolesItemService,
    rolePermissionsItemService,
    userRolesItemService,
  })

  const organisationMembersService = createOrganisationMembersService({
    organisationMembersItemService,
    usersItemService,
    organisationsItemService,
    rolesItemService,
    rbacService,
  })

  const organisationsService = createOrganisationsService({
    organisationsItemService,
    rolesItemService,
    usersItemService,
    organisationMembersService,
  })

  const seedDeps = { rolesItemService, rolePermissionsItemService }

  it('generates a fresh hex crypto_salt for new organisations', async () => {
    await seedRbac(seedDeps)
    const creator = await usersItemService.create(createUserData())
    const slug = `acme-${Date.now()}`

    await organisationsService.create({
      name: 'Acme',
      slug,
      creatorUserId: creator.id,
    })

    // organisationsService.create returns the OrganisationWithOwner shape (no salt
    // exposed), so re-read via the item service to assert the persisted column.
    const row = await organisationsItemService.findOne({ slug })
    expect(row).toBeDefined()
    expect(row!.cryptoSalt).toMatch(/^[0-9a-f]{32}$/)
  })

  it('produces a unique crypto_salt per organisation', async () => {
    await seedRbac(seedDeps)
    const creator = await usersItemService.create(createUserData())
    const stamp = Date.now()
    const slugA = `a-${stamp}`
    const slugB = `b-${stamp}`

    await organisationsService.create({ name: 'A', slug: slugA, creatorUserId: creator.id })
    await organisationsService.create({ name: 'B', slug: slugB, creatorUserId: creator.id })

    const a = await organisationsItemService.findOne({ slug: slugA })
    const b = await organisationsItemService.findOne({ slug: slugB })
    expect(a?.cryptoSalt).toMatch(/^[0-9a-f]{32}$/)
    expect(b?.cryptoSalt).toMatch(/^[0-9a-f]{32}$/)
    expect(a!.cryptoSalt).not.toBe(b!.cryptoSalt)
  })
})
