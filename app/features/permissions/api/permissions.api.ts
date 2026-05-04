import type { PermissionsResponse } from '../types/permissions.types'

/**
 * Permissions API wrapper using global $api for SSR cookie forwarding.
 * Must be called within a composable or component setup context.
 */
export const usePermissionsApi = () => {
  const { $api } = useNuxtApp()

  return {
    getMyPermissions: (): Promise<PermissionsResponse> =>
      $api('/api/me/permissions'),
  }
}
