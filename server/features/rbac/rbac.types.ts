import type { Role, RolePermission, UserRole } from '~~/server/database/schema'
import type { Permission, PermissionScope } from './permissions'

/**
 * Role with its assigned permissions
 */
export interface RoleWithPermissions extends Role {
  permissions: RolePermission[]
}

/**
 * User's permission context - cached per request
 */
export interface UserPermissionContext {
  userId: string
  /** Global permissions (scope='global', scopeId=null) */
  globalPermissions: Set<Permission>
  /** Organisation-scoped permissions: Map<orgId, Set<Permission>> */
  organisationPermissions: Map<string, Set<Permission>>
  /** Team-scoped permissions: Map<teamId, Set<Permission>> */
  teamPermissions: Map<string, Set<Permission>>
  /** All user role assignments */
  userRoles: UserRole[]
}

/**
 * Permission check request
 */
export interface PermissionCheck {
  permission: Permission
  scope: PermissionScope
  scopeId?: string | null
}

/**
 * Input for creating a new role
 */
export interface CreateRoleInput {
  name: string
  description?: string
  scope: PermissionScope
  organisationId?: string
  permissions: Permission[]
}

/**
 * Input for updating a role
 */
export interface UpdateRoleInput {
  name?: string
  description?: string
  permissions?: Permission[]
}

/**
 * Input for assigning a role to a user
 */
export interface AssignRoleInput {
  userId: string
  roleId: string
  scope: PermissionScope
  scopeId?: string | null
}

/**
 * Extended scope type for future extensibility
 */
export type RbacScope = 'global' | 'organisation' | 'team' | string

/**
 * Default role definitions for seeding
 */
export interface DefaultRoleDefinition {
  name: string
  description: string
  scope: PermissionScope
  isDefault: boolean
  permissions: Permission[]
}
