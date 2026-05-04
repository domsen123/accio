/**
 * Hardcoded permissions for the RBAC system.
 * Permissions are defined in code (not database) for type safety and simplicity.
 * Roles in the database reference these permission codes.
 */

export type PermissionScope = 'global' | 'organisation' | 'team'

export interface PermissionMetadata {
  code: string
  name: string
  description: string
  scope: PermissionScope
  category: string
}

// Permission constants
export const PERMISSIONS = {
  // Global scope
  PLATFORM_ADMIN: 'platform:admin',
  ORGANISATION_CREATE: 'organisation:create',

  // Organisation scope
  ORGANISATION_READ: 'organisation:read',
  ORGANISATION_UPDATE: 'organisation:update',
  ORGANISATION_DELETE: 'organisation:delete',
  ORGANISATION_MEMBER_VIEW: 'organisation:member:view',
  ORGANISATION_MEMBER_INVITE: 'organisation:member:invite',
  ORGANISATION_MEMBER_REMOVE: 'organisation:member:remove',
  ORGANISATION_MEMBER_ROLE_ASSIGN: 'organisation:member:role:assign',
  ORGANISATION_ROLE_CREATE: 'organisation:role:create',
  ORGANISATION_ROLE_UPDATE: 'organisation:role:update',
  ORGANISATION_ROLE_DELETE: 'organisation:role:delete',
  ORGANISATION_TEAM_CREATE: 'organisation:team:create',
  ORGANISATION_TEAM_VIEW: 'organisation:team:view',
  ORGANISATION_TEAM_DELETE: 'organisation:team:delete',
  ORGANISATION_BILLING_VIEW: 'organisation:billing:view',
  ORGANISATION_BILLING_MANAGE: 'organisation:billing:manage',

  // Team scope
  TEAM_READ: 'team:read',
  TEAM_UPDATE: 'team:update',
  TEAM_DELETE: 'team:delete',
  TEAM_MEMBER_VIEW: 'team:member:view',
  TEAM_MEMBER_ADD: 'team:member:add',
  TEAM_MEMBER_REMOVE: 'team:member:remove',
  TEAM_MEMBER_ROLE_ASSIGN: 'team:member:role:assign',
} as const

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

// Permission metadata for UI display and categorization
export const PERMISSION_METADATA: Record<Permission, PermissionMetadata> = {
  // Global scope
  [PERMISSIONS.PLATFORM_ADMIN]: {
    code: PERMISSIONS.PLATFORM_ADMIN,
    name: 'Platform Administrator',
    description: 'Full platform access - can manage all organisations and users',
    scope: 'global',
    category: 'platform',
  },
  [PERMISSIONS.ORGANISATION_CREATE]: {
    code: PERMISSIONS.ORGANISATION_CREATE,
    name: 'Create Organisation',
    description: 'Can create new organisations',
    scope: 'global',
    category: 'organisation',
  },

  // Organisation scope
  [PERMISSIONS.ORGANISATION_READ]: {
    code: PERMISSIONS.ORGANISATION_READ,
    name: 'View Organisation',
    description: 'Can view organisation details',
    scope: 'organisation',
    category: 'organisation',
  },
  [PERMISSIONS.ORGANISATION_UPDATE]: {
    code: PERMISSIONS.ORGANISATION_UPDATE,
    name: 'Update Organisation',
    description: 'Can update organisation settings',
    scope: 'organisation',
    category: 'organisation',
  },
  [PERMISSIONS.ORGANISATION_DELETE]: {
    code: PERMISSIONS.ORGANISATION_DELETE,
    name: 'Delete Organisation',
    description: 'Can delete the organisation',
    scope: 'organisation',
    category: 'organisation',
  },
  [PERMISSIONS.ORGANISATION_MEMBER_VIEW]: {
    code: PERMISSIONS.ORGANISATION_MEMBER_VIEW,
    name: 'View Members',
    description: 'Can view organisation members',
    scope: 'organisation',
    category: 'member',
  },
  [PERMISSIONS.ORGANISATION_MEMBER_INVITE]: {
    code: PERMISSIONS.ORGANISATION_MEMBER_INVITE,
    name: 'Invite Members',
    description: 'Can invite new members to the organisation',
    scope: 'organisation',
    category: 'member',
  },
  [PERMISSIONS.ORGANISATION_MEMBER_REMOVE]: {
    code: PERMISSIONS.ORGANISATION_MEMBER_REMOVE,
    name: 'Remove Members',
    description: 'Can remove members from the organisation',
    scope: 'organisation',
    category: 'member',
  },
  [PERMISSIONS.ORGANISATION_MEMBER_ROLE_ASSIGN]: {
    code: PERMISSIONS.ORGANISATION_MEMBER_ROLE_ASSIGN,
    name: 'Assign Member Roles',
    description: 'Can assign roles to organisation members',
    scope: 'organisation',
    category: 'member',
  },
  [PERMISSIONS.ORGANISATION_ROLE_CREATE]: {
    code: PERMISSIONS.ORGANISATION_ROLE_CREATE,
    name: 'Create Custom Roles',
    description: 'Can create custom roles for the organisation',
    scope: 'organisation',
    category: 'role',
  },
  [PERMISSIONS.ORGANISATION_ROLE_UPDATE]: {
    code: PERMISSIONS.ORGANISATION_ROLE_UPDATE,
    name: 'Update Custom Roles',
    description: 'Can update custom roles',
    scope: 'organisation',
    category: 'role',
  },
  [PERMISSIONS.ORGANISATION_ROLE_DELETE]: {
    code: PERMISSIONS.ORGANISATION_ROLE_DELETE,
    name: 'Delete Custom Roles',
    description: 'Can delete custom roles',
    scope: 'organisation',
    category: 'role',
  },
  [PERMISSIONS.ORGANISATION_TEAM_CREATE]: {
    code: PERMISSIONS.ORGANISATION_TEAM_CREATE,
    name: 'Create Teams',
    description: 'Can create teams within the organisation',
    scope: 'organisation',
    category: 'team',
  },
  [PERMISSIONS.ORGANISATION_TEAM_VIEW]: {
    code: PERMISSIONS.ORGANISATION_TEAM_VIEW,
    name: 'View All Teams',
    description: 'Can view all teams in the organisation',
    scope: 'organisation',
    category: 'team',
  },
  [PERMISSIONS.ORGANISATION_TEAM_DELETE]: {
    code: PERMISSIONS.ORGANISATION_TEAM_DELETE,
    name: 'Delete Any Team',
    description: 'Can delete any team in the organisation',
    scope: 'organisation',
    category: 'team',
  },
  [PERMISSIONS.ORGANISATION_BILLING_VIEW]: {
    code: PERMISSIONS.ORGANISATION_BILLING_VIEW,
    name: 'View Billing',
    description: 'Can view billing information',
    scope: 'organisation',
    category: 'billing',
  },
  [PERMISSIONS.ORGANISATION_BILLING_MANAGE]: {
    code: PERMISSIONS.ORGANISATION_BILLING_MANAGE,
    name: 'Manage Billing',
    description: 'Can manage billing and subscription',
    scope: 'organisation',
    category: 'billing',
  },

  // Team scope
  [PERMISSIONS.TEAM_READ]: {
    code: PERMISSIONS.TEAM_READ,
    name: 'View Team',
    description: 'Can view team details',
    scope: 'team',
    category: 'team',
  },
  [PERMISSIONS.TEAM_UPDATE]: {
    code: PERMISSIONS.TEAM_UPDATE,
    name: 'Update Team',
    description: 'Can update team settings',
    scope: 'team',
    category: 'team',
  },
  [PERMISSIONS.TEAM_DELETE]: {
    code: PERMISSIONS.TEAM_DELETE,
    name: 'Delete Team',
    description: 'Can delete the team',
    scope: 'team',
    category: 'team',
  },
  [PERMISSIONS.TEAM_MEMBER_VIEW]: {
    code: PERMISSIONS.TEAM_MEMBER_VIEW,
    name: 'View Team Members',
    description: 'Can view team members',
    scope: 'team',
    category: 'member',
  },
  [PERMISSIONS.TEAM_MEMBER_ADD]: {
    code: PERMISSIONS.TEAM_MEMBER_ADD,
    name: 'Add Team Members',
    description: 'Can add members to the team',
    scope: 'team',
    category: 'member',
  },
  [PERMISSIONS.TEAM_MEMBER_REMOVE]: {
    code: PERMISSIONS.TEAM_MEMBER_REMOVE,
    name: 'Remove Team Members',
    description: 'Can remove members from the team',
    scope: 'team',
    category: 'member',
  },
  [PERMISSIONS.TEAM_MEMBER_ROLE_ASSIGN]: {
    code: PERMISSIONS.TEAM_MEMBER_ROLE_ASSIGN,
    name: 'Assign Team Roles',
    description: 'Can assign roles to team members',
    scope: 'team',
    category: 'member',
  },
}

// Helper to get all permissions for a specific scope
export const getPermissionsByScope = (scope: PermissionScope): PermissionMetadata[] => {
  return Object.values(PERMISSION_METADATA).filter(p => p.scope === scope)
}

// Helper to get all permissions grouped by category
export const getPermissionsByCategory = (): Record<string, PermissionMetadata[]> => {
  return Object.values(PERMISSION_METADATA).reduce(
    (acc, permission) => {
      const category = permission.category
      if (!acc[category]) {
        acc[category] = []
      }
      acc[category]!.push(permission)
      return acc
    },
    {} as Record<string, PermissionMetadata[]>,
  )
}

// All permission codes as an array (for validation)
export const ALL_PERMISSIONS = Object.values(PERMISSIONS)

// Check if a string is a valid permission code
export const isValidPermission = (code: string): code is Permission => {
  return ALL_PERMISSIONS.includes(code as Permission)
}
