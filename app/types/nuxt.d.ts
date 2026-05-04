import type { ImpersonationInfo, SessionUser } from '~/features/auth/types/auth.types'
import type { PermissionsResponse } from '~/features/permissions/types/permissions.types'

interface AuthPayload {
  user: SessionUser | null
  impersonation: ImpersonationInfo | null
  permissions: PermissionsResponse
}

declare module '#app' {
  interface NuxtApp {
    $api: typeof $fetch
  }

  interface NuxtPayload {
    auth?: AuthPayload
  }
}

declare module 'vue' {
  interface ComponentCustomProperties {
    $api: typeof $fetch
  }
}

export {}
