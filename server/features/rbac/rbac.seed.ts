import type { rolePermissions, roles } from '~~/server/database/schema'
import type { ItemService } from '~~/server/infrastructure/database/item-service'
import type { PermissionScope } from './permissions'
import type { DefaultRoleDefinition } from './rbac.types'
import { PERMISSIONS } from './permissions'

/**
 * Default system roles with their permissions
 */
export const DEFAULT_ROLES: DefaultRoleDefinition[] = [
  // Global scope
  {
    name: 'Super Admin',
    description: 'Full platform access - can manage all organisations and users',
    scope: 'global',
    isDefault: false,
    permissions: [PERMISSIONS.PLATFORM_ADMIN],
  },
  {
    name: 'User',
    description: 'Standard user - can create organisations',
    scope: 'global',
    isDefault: true,
    permissions: [PERMISSIONS.ORGANISATION_CREATE],
  },

  // Organisation scope
  {
    name: 'Owner',
    description: 'Full organisation control',
    scope: 'organisation',
    isDefault: false,
    permissions: [
      PERMISSIONS.ORGANISATION_READ,
      PERMISSIONS.ORGANISATION_UPDATE,
      PERMISSIONS.ORGANISATION_DELETE,
      PERMISSIONS.ORGANISATION_MEMBER_VIEW,
      PERMISSIONS.ORGANISATION_MEMBER_INVITE,
      PERMISSIONS.ORGANISATION_MEMBER_REMOVE,
      PERMISSIONS.ORGANISATION_MEMBER_ROLE_ASSIGN,
      PERMISSIONS.ORGANISATION_ROLE_CREATE,
      PERMISSIONS.ORGANISATION_ROLE_UPDATE,
      PERMISSIONS.ORGANISATION_ROLE_DELETE,
      PERMISSIONS.ORGANISATION_TEAM_CREATE,
      PERMISSIONS.ORGANISATION_TEAM_VIEW,
      PERMISSIONS.ORGANISATION_TEAM_DELETE,
      PERMISSIONS.ORGANISATION_BILLING_VIEW,
      PERMISSIONS.ORGANISATION_BILLING_MANAGE,
    ],
  },
  {
    name: 'Admin',
    description: 'Organisation administration (no delete org or billing)',
    scope: 'organisation',
    isDefault: false,
    permissions: [
      PERMISSIONS.ORGANISATION_READ,
      PERMISSIONS.ORGANISATION_UPDATE,
      PERMISSIONS.ORGANISATION_MEMBER_VIEW,
      PERMISSIONS.ORGANISATION_MEMBER_INVITE,
      PERMISSIONS.ORGANISATION_MEMBER_REMOVE,
      PERMISSIONS.ORGANISATION_MEMBER_ROLE_ASSIGN,
      PERMISSIONS.ORGANISATION_ROLE_CREATE,
      PERMISSIONS.ORGANISATION_ROLE_UPDATE,
      PERMISSIONS.ORGANISATION_ROLE_DELETE,
      PERMISSIONS.ORGANISATION_TEAM_CREATE,
      PERMISSIONS.ORGANISATION_TEAM_VIEW,
      PERMISSIONS.ORGANISATION_TEAM_DELETE,
    ],
  },
  {
    name: 'Member',
    description: 'Standard organisation member',
    scope: 'organisation',
    isDefault: true,
    permissions: [
      PERMISSIONS.ORGANISATION_READ,
      PERMISSIONS.ORGANISATION_MEMBER_VIEW,
      PERMISSIONS.ORGANISATION_TEAM_VIEW,
    ],
  },

  // Team scope
  {
    name: 'Lead',
    description: 'Team leadership - full team control',
    scope: 'team',
    isDefault: false,
    permissions: [
      PERMISSIONS.TEAM_READ,
      PERMISSIONS.TEAM_UPDATE,
      PERMISSIONS.TEAM_DELETE,
      PERMISSIONS.TEAM_MEMBER_VIEW,
      PERMISSIONS.TEAM_MEMBER_ADD,
      PERMISSIONS.TEAM_MEMBER_REMOVE,
      PERMISSIONS.TEAM_MEMBER_ROLE_ASSIGN,
    ],
  },
  {
    name: 'Member',
    description: 'Standard team member',
    scope: 'team',
    isDefault: true,
    permissions: [
      PERMISSIONS.TEAM_READ,
      PERMISSIONS.TEAM_MEMBER_VIEW,
    ],
  },
]

export interface SeedRbacDeps {
  rolesItemService: ItemService<typeof roles>
  rolePermissionsItemService: ItemService<typeof rolePermissions>
}

/**
 * Seed default system roles and their permissions.
 * This function is idempotent - it will not create duplicates.
 */
export const seedRbac = async (deps: SeedRbacDeps): Promise<void> => {
  const { rolesItemService, rolePermissionsItemService } = deps

  for (const roleDef of DEFAULT_ROLES) {
    // Check if role already exists by name and scope
    const existingRole = await rolesItemService.findOne({
      name: roleDef.name,
      scope: roleDef.scope,
      isSystem: true,
    })

    if (existingRole) {
      console.log(`[RBAC Seed] Role "${roleDef.name}" (${roleDef.scope}) already exists, skipping`)
      continue
    }

    // Create the role
    const role = await rolesItemService.create({
      name: roleDef.name,
      description: roleDef.description,
      scope: roleDef.scope,
      isSystem: true,
      isDefault: roleDef.isDefault,
      organisationId: null,
    })

    // Create role permissions
    for (const permission of roleDef.permissions) {
      await rolePermissionsItemService.create({
        roleId: role.id,
        permission,
      })
    }

    console.log(`[RBAC Seed] Created role "${roleDef.name}" (${roleDef.scope}) with ${roleDef.permissions.length} permissions`)
  }

  console.log('[RBAC Seed] Seeding complete')
}

/**
 * Get the system role ID by name and scope
 */
export const getSystemRoleId = async (
  rolesItemService: ItemService<typeof roles>,
  name: string,
  scope: PermissionScope,
): Promise<string | null> => {
  const role = await rolesItemService.findOne({
    name,
    scope,
    isSystem: true,
  })
  return role?.id ?? null
}
