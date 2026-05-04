import type { rolePermissions, roles, userRoles } from '~~/server/database/schema'
import type { ItemService } from '~~/server/infrastructure/database/item-service'
import type { Permission, PermissionScope } from './permissions'
import type {
  AssignRoleInput,
  CreateRoleInput,
  PermissionCheck,
  RoleWithPermissions,
  UpdateRoleInput,
  UserPermissionContext,
} from './rbac.types'
import { isValidPermission, PERMISSIONS } from './permissions'

export interface CreateRbacServiceDeps {
  rolesItemService: ItemService<typeof roles>
  rolePermissionsItemService: ItemService<typeof rolePermissions>
  userRolesItemService: ItemService<typeof userRoles>
}

export const createRbacService = (deps: CreateRbacServiceDeps) => {
  const { rolesItemService, rolePermissionsItemService, userRolesItemService } = deps

  /**
   * Load all permissions for a user across all scopes
   */
  const loadUserPermissionContext = async (userId: string): Promise<UserPermissionContext> => {
    // Get all user role assignments
    const assignments = await userRolesItemService.findMany({
      filter: { userId },
    })

    const globalPermissions = new Set<Permission>()
    const organisationPermissions = new Map<string, Set<Permission>>()
    const teamPermissions = new Map<string, Set<Permission>>()

    // Get unique role IDs
    const roleIds = [...new Set(assignments.map(a => a.roleId))]

    if (roleIds.length === 0) {
      return { userId, globalPermissions, organisationPermissions, teamPermissions, userRoles: assignments }
    }

    // Fetch all role permissions in one query
    const allRolePermissions = await rolePermissionsItemService.findMany({
      filter: { roleId: { _in: roleIds } },
    })

    // Group permissions by role
    const permissionsByRole = new Map<string, Set<Permission>>()
    for (const rp of allRolePermissions) {
      if (!isValidPermission(rp.permission))
        continue
      if (!permissionsByRole.has(rp.roleId)) {
        permissionsByRole.set(rp.roleId, new Set())
      }
      permissionsByRole.get(rp.roleId)!.add(rp.permission as Permission)
    }

    // Distribute permissions to appropriate scope maps
    for (const assignment of assignments) {
      const rolePerms = permissionsByRole.get(assignment.roleId) || new Set<Permission>()

      switch (assignment.scope) {
        case 'global':
          for (const p of rolePerms) globalPermissions.add(p)
          break
        case 'organisation':
          if (assignment.scopeId) {
            if (!organisationPermissions.has(assignment.scopeId)) {
              organisationPermissions.set(assignment.scopeId, new Set())
            }
            for (const p of rolePerms) {
              organisationPermissions.get(assignment.scopeId)!.add(p)
            }
          }
          break
        case 'team':
          if (assignment.scopeId) {
            if (!teamPermissions.has(assignment.scopeId)) {
              teamPermissions.set(assignment.scopeId, new Set())
            }
            for (const p of rolePerms) {
              teamPermissions.get(assignment.scopeId)!.add(p)
            }
          }
          break
      }
    }

    return { userId, globalPermissions, organisationPermissions, teamPermissions, userRoles: assignments }
  }

  /**
   * Check permission using a pre-loaded context (more efficient for multiple checks)
   */
  const hasPermissionInContext = (
    context: UserPermissionContext,
    check: PermissionCheck,
  ): boolean => {
    // Super admin has all permissions
    if (context.globalPermissions.has(PERMISSIONS.PLATFORM_ADMIN)) {
      return true
    }

    switch (check.scope) {
      case 'global':
        return context.globalPermissions.has(check.permission)
      case 'organisation':
        if (!check.scopeId)
          return false
        return context.organisationPermissions.get(check.scopeId)?.has(check.permission) ?? false
      case 'team':
        if (!check.scopeId)
          return false
        return context.teamPermissions.get(check.scopeId)?.has(check.permission) ?? false
      default:
        return false
    }
  }

  /**
   * Check if a user has a specific permission
   */
  const hasPermission = async (
    userId: string,
    check: PermissionCheck,
  ): Promise<boolean> => {
    const context = await loadUserPermissionContext(userId)
    return hasPermissionInContext(context, check)
  }

  /**
   * Check if user is a super admin
   */
  const isSuperAdmin = async (userId: string): Promise<boolean> => {
    const context = await loadUserPermissionContext(userId)
    return context.globalPermissions.has(PERMISSIONS.PLATFORM_ADMIN)
  }

  /**
   * Create a new role
   */
  const createRole = async (input: CreateRoleInput): Promise<RoleWithPermissions> => {
    // Validate permissions
    for (const p of input.permissions) {
      if (!isValidPermission(p)) {
        throw createError({ statusCode: 400, statusMessage: `Invalid permission: ${p}` })
      }
    }

    // Create the role
    const role = await rolesItemService.create({
      name: input.name,
      description: input.description ?? null,
      scope: input.scope,
      isSystem: false,
      isDefault: false,
      organisationId: input.organisationId ?? null,
    })

    // Add permissions
    const rolePermissionRecords = await rolePermissionsItemService.createMany(
      input.permissions.map(permission => ({
        roleId: role.id,
        permission,
      })),
    )

    return { ...role, permissions: rolePermissionRecords }
  }

  /**
   * Update an existing role (non-system roles only)
   */
  const updateRole = async (roleId: string, input: UpdateRoleInput): Promise<RoleWithPermissions> => {
    const role = await rolesItemService.readOne(roleId)
    if (!role) {
      throw createError({ statusCode: 404, statusMessage: 'Role not found' })
    }
    if (role.isSystem) {
      throw createError({ statusCode: 403, statusMessage: 'Cannot modify system roles' })
    }

    // Update role metadata
    const updatedRole = await rolesItemService.update(roleId, {
      name: input.name,
      description: input.description,
    })

    // Update permissions if provided
    if (input.permissions) {
      // Validate permissions
      for (const p of input.permissions) {
        if (!isValidPermission(p)) {
          throw createError({ statusCode: 400, statusMessage: `Invalid permission: ${p}` })
        }
      }

      // Delete existing permissions
      const existingPermissions = await rolePermissionsItemService.findMany({
        filter: { roleId },
      })
      for (const ep of existingPermissions) {
        await rolePermissionsItemService.delete(ep.id)
      }

      // Add new permissions
      await rolePermissionsItemService.createMany(
        input.permissions.map(permission => ({
          roleId,
          permission,
        })),
      )
    }

    // Fetch updated permissions
    const permissions = await rolePermissionsItemService.findMany({
      filter: { roleId },
    })

    return { ...updatedRole, permissions }
  }

  /**
   * Delete a role (non-system roles only)
   */
  const deleteRole = async (roleId: string): Promise<void> => {
    const role = await rolesItemService.readOne(roleId)
    if (!role) {
      throw createError({ statusCode: 404, statusMessage: 'Role not found' })
    }
    if (role.isSystem) {
      throw createError({ statusCode: 403, statusMessage: 'Cannot delete system roles' })
    }

    await rolesItemService.delete(roleId)
  }

  /**
   * Get a role with its permissions
   */
  const getRoleWithPermissions = async (roleId: string): Promise<RoleWithPermissions | null> => {
    const role = await rolesItemService.readOne(roleId)
    if (!role)
      return null

    const permissions = await rolePermissionsItemService.findMany({
      filter: { roleId },
    })

    return { ...role, permissions }
  }

  /**
   * Get roles by scope (optionally filtered by organisation for custom roles)
   */
  const getRolesByScope = async (
    scope: PermissionScope,
    organisationId?: string,
  ): Promise<RoleWithPermissions[]> => {
    // Build filter for roles
    const filter: Record<string, unknown> = { scope }

    // For organisation scope, include system roles (no organisationId) AND org-specific custom roles
    if (scope === 'organisation' && organisationId) {
      const systemRoles = await rolesItemService.findMany({
        filter: { scope, isSystem: true },
      })
      const customRoles = await rolesItemService.findMany({
        filter: { scope, organisationId },
      })
      const allRoles = [...systemRoles, ...customRoles]

      // Fetch permissions for all roles
      return Promise.all(
        allRoles.map(async (role) => {
          const permissions = await rolePermissionsItemService.findMany({
            filter: { roleId: role.id },
          })
          return { ...role, permissions }
        }),
      )
    }

    // For global or team scope
    const roles = await rolesItemService.findMany({ filter })

    return Promise.all(
      roles.map(async (role) => {
        const permissions = await rolePermissionsItemService.findMany({
          filter: { roleId: role.id },
        })
        return { ...role, permissions }
      }),
    )
  }

  /**
   * Assign a role to a user
   */
  const assignRole = async (input: AssignRoleInput): Promise<void> => {
    // Verify role exists and matches scope
    const role = await rolesItemService.readOne(input.roleId)
    if (!role) {
      throw createError({ statusCode: 404, statusMessage: 'Role not found' })
    }
    if (role.scope !== input.scope) {
      throw createError({
        statusCode: 400,
        statusMessage: `Role scope mismatch: role is ${role.scope}, assignment is ${input.scope}`,
      })
    }

    // Check for existing assignment
    const existing = await userRolesItemService.findOne({
      userId: input.userId,
      roleId: input.roleId,
      scope: input.scope,
      scopeId: input.scopeId ?? null,
    })

    if (existing) {
      // Already assigned, nothing to do
      return
    }

    await userRolesItemService.create({
      userId: input.userId,
      roleId: input.roleId,
      scope: input.scope,
      scopeId: input.scopeId ?? null,
    })
  }

  /**
   * Remove a role from a user
   */
  const removeRole = async (
    userId: string,
    roleId: string,
    scope: PermissionScope,
    scopeId?: string | null,
  ): Promise<void> => {
    const assignment = await userRolesItemService.findOne({
      userId,
      roleId,
      scope,
      scopeId: scopeId ?? null,
    })

    if (!assignment) {
      throw createError({ statusCode: 404, statusMessage: 'Role assignment not found' })
    }

    await userRolesItemService.delete(assignment.id)
  }

  /**
   * Get all roles assigned to a user, optionally filtered by scope
   */
  const getUserRoles = async (
    userId: string,
    scope?: PermissionScope,
    scopeId?: string,
  ): Promise<RoleWithPermissions[]> => {
    const filter: Record<string, unknown> = { userId }
    if (scope)
      filter.scope = scope
    if (scopeId)
      filter.scopeId = scopeId

    const assignments = await userRolesItemService.findMany({ filter })

    const roleIds = [...new Set(assignments.map(a => a.roleId))]
    if (roleIds.length === 0)
      return []

    return Promise.all(
      roleIds.map(async (roleId) => {
        const role = await rolesItemService.readOne(roleId)
        if (!role)
          throw createError({ statusCode: 500, statusMessage: `Role ${roleId} not found` })
        const permissions = await rolePermissionsItemService.findMany({
          filter: { roleId },
        })
        return { ...role, permissions }
      }),
    )
  }

  /**
   * Get the default role for a scope
   */
  const getDefaultRole = async (scope: PermissionScope): Promise<RoleWithPermissions | null> => {
    const role = await rolesItemService.findOne({ scope, isDefault: true })
    if (!role)
      return null

    const permissions = await rolePermissionsItemService.findMany({
      filter: { roleId: role.id },
    })

    return { ...role, permissions }
  }

  return {
    // Permission checking
    loadUserPermissionContext,
    hasPermission,
    hasPermissionInContext,
    isSuperAdmin,

    // Role management
    createRole,
    updateRole,
    deleteRole,
    getRoleWithPermissions,
    getRolesByScope,
    getDefaultRole,

    // Role assignment
    assignRole,
    removeRole,
    getUserRoles,
  }
}

export type RbacService = ReturnType<typeof createRbacService>
