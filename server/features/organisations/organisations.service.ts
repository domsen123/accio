import type { organisations, roles, users } from '~~/server/database/schema'
import type { ItemService } from '~~/server/infrastructure/database/item-service'
import type { OrganisationMembersService } from '../organisation-members/organisation-members.service'
import type { CreateOrganisationInput, OrganisationWithOwner } from './organisations.types'
import { randomBytes } from 'node:crypto'
import { getSystemRoleId } from '../rbac/rbac.seed'

// Per-organisation HKDF salt for AES-256-GCM key derivation (DESIGN-CRYPTO).
// 16 random bytes encoded as 32 hex chars; stable across the org's lifetime.
const generateCryptoSalt = () => randomBytes(16).toString('hex')

export interface CreateOrganisationsServiceDeps {
  organisationsItemService: ItemService<typeof organisations>
  rolesItemService: ItemService<typeof roles>
  usersItemService: ItemService<typeof users>
  organisationMembersService: OrganisationMembersService
}

export const createOrganisationsService = (deps: CreateOrganisationsServiceDeps) => {
  const {
    organisationsItemService,
    rolesItemService,
    usersItemService,
    organisationMembersService,
  } = deps

  /**
   * Create an organisation and automatically assign the creator as Owner
   */
  const create = async (input: CreateOrganisationInput): Promise<OrganisationWithOwner> => {
    const { name, slug, creatorUserId } = input

    // Verify creator user exists
    const creator = await usersItemService.readOne(creatorUserId)
    if (!creator) {
      throw createError({ statusCode: 404, statusMessage: 'Creator user not found' })
    }

    // Check slug uniqueness
    const existing = await organisationsItemService.findOne({
      slug: { _eq: slug },
    })
    if (existing) {
      throw createError({ statusCode: 409, statusMessage: 'An organisation with this slug already exists' })
    }

    // Create the organisation with a fresh per-org crypto salt (DESIGN-CRYPTO).
    const organisation = await organisationsItemService.create({
      name,
      slug,
      cryptoSalt: generateCryptoSalt(),
    })

    // Get the Owner role ID
    const ownerRoleId = await getSystemRoleId(rolesItemService, 'Owner', 'organisation')
    if (!ownerRoleId) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Owner role not found. Please ensure RBAC has been seeded.',
      })
    }

    // Add creator as owner member
    await organisationMembersService.addMember({
      organisationId: organisation.id,
      userId: creatorUserId,
      roleId: ownerRoleId,
    })

    return {
      id: organisation.id,
      name: organisation.name,
      slug: organisation.slug,
      createdAt: organisation.createdAt,
      updatedAt: organisation.updatedAt,
      owner: {
        id: creator.id,
        email: creator.email,
        name: creator.name,
      },
    }
  }

  return {
    create,
  }
}

export type OrganisationsService = ReturnType<typeof createOrganisationsService>
