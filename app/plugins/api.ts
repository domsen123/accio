import type { SessionResponse } from '~/features/auth/types/auth.types'
import type { PermissionsResponse } from '~/features/permissions/types/permissions.types'
import { useQueryCache } from '@pinia/colada'
import { authKeys } from '~/features/auth/api/auth.keys'
import { permissionsKeys } from '~/features/permissions/api/permissions.keys'

/**
 * Plugin that creates a global $api fetch instance with automatic cookie forwarding.
 * This ensures httpOnly cookies are forwarded during SSR for authenticated requests.
 *
 * Also pre-fetches auth state during SSR for:
 * 1. Middleware access via useServerAuth() (reads from nuxtApp.payload.auth)
 * 2. Seeds Pinia Colada cache so useSession() doesn't re-fetch
 */
export default defineNuxtPlugin(async (nuxtApp) => {
  const cookieString = useRequestHeader('cookie')

  const api = $fetch.create({
    credentials: 'include',
    onRequest({ options }) {
      if (import.meta.server && cookieString) {
        const headers = options.headers ??= new Headers()
        if (headers instanceof Headers) {
          headers.set('cookie', cookieString)
        }
      }
    },
  })

  // Pre-fetch auth during SSR for middleware and seed Pinia Colada cache
  if (import.meta.server) {
    try {
      const session = await api<SessionResponse>('/api/auth/session')

      // Fetch permissions if authenticated
      let permissions: PermissionsResponse | null = null
      if (session?.user) {
        permissions = await api<PermissionsResponse>('/api/me/permissions').catch(() => null)
      }

      const defaultPermissions: PermissionsResponse = {
        userId: '',
        global: [],
        organisations: {},
        teams: {},
      }

      // Store in payload for middleware (useServerAuth reads this)
      nuxtApp.payload.auth = {
        user: session?.user ?? null,
        impersonation: session?.impersonation ?? null,
        permissions: permissions ?? defaultPermissions,
      }

      // Seed Pinia Colada cache so useSession() doesn't re-fetch
      const queryCache = useQueryCache()
      queryCache.setQueryData(authKeys.session(), {
        user: session?.user ?? null,
        impersonation: session?.impersonation ?? null,
      })

      if (session?.user && permissions) {
        queryCache.setQueryData(permissionsKeys.my(), permissions)
      }
    }
    catch {
      nuxtApp.payload.auth = {
        user: null,
        impersonation: null,
        permissions: { userId: '', global: [], organisations: {}, teams: {} },
      }
    }
  }

  return { provide: { api } }
})
