import type { AuthUser, ImpersonationInfo } from '~/features/auth/types/auth.types'
import type { PermissionsResponse } from '~/features/permissions/types/permissions.types'

interface ServerAuthPayload {
  user: AuthUser | null
  impersonation: ImpersonationInfo | null
  permissions: PermissionsResponse
}

/**
 * Composable to access pre-fetched auth state from the server plugin.
 * Safe to use in middleware because it doesn't use Pinia-Colada/inject().
 *
 * Note: This composable reads from nuxtApp.payload.auth which is populated
 * by the auth.server.ts plugin during SSR.
 */
export const useServerAuth = () => {
  const nuxtApp = useNuxtApp()
  const auth = nuxtApp.payload.auth as ServerAuthPayload | undefined

  const defaultPermissions: PermissionsResponse = {
    userId: '',
    global: [],
    organisations: {},
    teams: {},
  }

  return {
    user: auth?.user ?? null,
    isAuthenticated: !!auth?.user,
    isAnonymous: auth?.user?.authProvider === 'anonymous',
    impersonation: auth?.impersonation ?? null,
    isImpersonating: !!auth?.impersonation,
    permissions: auth?.permissions ?? defaultPermissions,
    isGlobalAdmin: auth?.permissions?.global?.includes('platform:admin') ?? false,
    hasGlobalPermission: (permission: string) =>
      auth?.permissions?.global?.includes(permission) ?? false,
    hasOrgPermission: (orgId: string, permission: string) =>
      auth?.permissions?.organisations[orgId]?.includes(permission) ?? false,
    hasTeamPermission: (teamId: string, permission: string) =>
      auth?.permissions?.teams[teamId]?.includes(permission) ?? false,
  }
}
