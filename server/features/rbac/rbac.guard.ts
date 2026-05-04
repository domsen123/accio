import type { H3Event } from 'h3'
import type { Permission, PermissionScope } from './permissions'
import type { UserPermissionContext } from './rbac.types'
import { container } from '~~/server/utils/container'
import { PERMISSIONS } from './permissions'

export interface RequirePermissionOptions {
  permission: Permission
  scope: PermissionScope
  /** Function to extract scope ID from event (for organisation/team scope) */
  getScopeId?: (event: H3Event) => string | undefined
}

/**
 * Get or load the user's permission context.
 * Caches the context in event.context for the duration of the request.
 */
export const getPermissionContext = async (event: H3Event): Promise<UserPermissionContext | null> => {
  const user = event.context.user
  if (!user)
    return null

  // Check cache first
  if (event.context.permissions) {
    return event.context.permissions as UserPermissionContext
  }

  // Load and cache
  const context = await container.rbacService.loadUserPermissionContext(user.id)
  event.context.permissions = context
  return context
}

/**
 * Guard that requires authentication.
 * Throws 401 if not authenticated.
 */
export const requireAuth = (event: H3Event) => {
  const user = event.context.user
  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    })
  }
  return user
}

/**
 * Guard that requires a specific permission.
 * Throws 401 if not authenticated, 403 if missing permission.
 */
export const requirePermission = async (
  event: H3Event,
  options: RequirePermissionOptions,
): Promise<void> => {
  requireAuth(event)
  const context = await getPermissionContext(event)

  if (!context) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden - no permissions loaded',
    })
  }

  // Super admin has all permissions
  if (context.globalPermissions.has(PERMISSIONS.PLATFORM_ADMIN)) {
    return
  }

  const scopeId = options.getScopeId?.(event)

  let hasPermission = false
  switch (options.scope) {
    case 'global':
      hasPermission = context.globalPermissions.has(options.permission)
      break
    case 'organisation':
      if (!scopeId) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Organisation ID required for this operation',
        })
      }
      hasPermission = context.organisationPermissions.get(scopeId)?.has(options.permission) ?? false
      break
    case 'team':
      if (!scopeId) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Team ID required for this operation',
        })
      }
      hasPermission = context.teamPermissions.get(scopeId)?.has(options.permission) ?? false
      break
  }

  if (!hasPermission) {
    throw createError({
      statusCode: 403,
      statusMessage: `Forbidden - missing permission: ${options.permission}`,
    })
  }
}

/**
 * Guard that requires any of the listed permissions.
 * Throws 401 if not authenticated, 403 if missing all permissions.
 */
export const requireAnyPermission = async (
  event: H3Event,
  options: RequirePermissionOptions[],
): Promise<void> => {
  requireAuth(event)
  const context = await getPermissionContext(event)

  if (!context) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden - no permissions loaded',
    })
  }

  // Super admin has all permissions
  if (context.globalPermissions.has(PERMISSIONS.PLATFORM_ADMIN)) {
    return
  }

  for (const opt of options) {
    const scopeId = opt.getScopeId?.(event)

    let hasPermission = false
    switch (opt.scope) {
      case 'global':
        hasPermission = context.globalPermissions.has(opt.permission)
        break
      case 'organisation':
        if (scopeId) {
          hasPermission = context.organisationPermissions.get(scopeId)?.has(opt.permission) ?? false
        }
        break
      case 'team':
        if (scopeId) {
          hasPermission = context.teamPermissions.get(scopeId)?.has(opt.permission) ?? false
        }
        break
    }

    if (hasPermission)
      return
  }

  throw createError({
    statusCode: 403,
    statusMessage: 'Forbidden - missing required permissions',
  })
}

/**
 * Guard that requires all listed permissions.
 * Throws 401 if not authenticated, 403 if missing any permission.
 */
export const requireAllPermissions = async (
  event: H3Event,
  options: RequirePermissionOptions[],
): Promise<void> => {
  for (const opt of options) {
    await requirePermission(event, opt)
  }
}

/**
 * Guard for super-admin only actions.
 * Throws 401 if not authenticated, 403 if not super admin.
 */
export const requireSuperAdmin = async (event: H3Event): Promise<void> => {
  requireAuth(event)
  const context = await getPermissionContext(event)

  if (!context || !context.globalPermissions.has(PERMISSIONS.PLATFORM_ADMIN)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden - super admin access required',
    })
  }
}

/**
 * Check permission without throwing (returns boolean).
 * Useful for conditional UI logic in API responses.
 */
export const canAccess = async (
  event: H3Event,
  options: RequirePermissionOptions,
): Promise<boolean> => {
  const user = event.context.user
  if (!user)
    return false

  const context = await getPermissionContext(event)
  if (!context)
    return false

  // Super admin has all permissions
  if (context.globalPermissions.has(PERMISSIONS.PLATFORM_ADMIN)) {
    return true
  }

  const scopeId = options.getScopeId?.(event)

  switch (options.scope) {
    case 'global':
      return context.globalPermissions.has(options.permission)
    case 'organisation':
      if (!scopeId)
        return false
      return context.organisationPermissions.get(scopeId)?.has(options.permission) ?? false
    case 'team':
      if (!scopeId)
        return false
      return context.teamPermissions.get(scopeId)?.has(options.permission) ?? false
    default:
      return false
  }
}

/**
 * Helper to get organisation ID from route params
 */
export const getOrgIdFromParams = (event: H3Event): string | undefined => {
  return getRouterParam(event, 'orgId') || getRouterParam(event, 'organisationId')
}

/**
 * Helper to get team ID from route params
 */
export const getTeamIdFromParams = (event: H3Event): string | undefined => {
  return getRouterParam(event, 'teamId')
}
