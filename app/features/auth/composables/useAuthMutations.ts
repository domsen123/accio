import type {
  AuthUser,
  ForgotPasswordCredentials,
  LoginCredentials,
  RegisterCredentials,
  ResetPasswordCredentials,
} from '../types/auth.types'
import type { PermissionsResponse } from '~/features/permissions/types/permissions.types'
import { useMutation, useQueryCache } from '@pinia/colada'
import { useAuthApi } from '../api/auth.api'
import { authKeys } from '../api/auth.keys'

const defaultPermissions: PermissionsResponse = {
  userId: '',
  global: [],
  organisations: {},
  teams: {},
}

/**
 * Updates nuxtApp.payload.auth after successful login/register.
 * This is necessary because the auth middleware reads from payload.auth,
 * which is only populated during SSR. Without this, client-side login
 * would leave the payload stale, causing protected route redirects.
 */
const updateAuthPayload = async (user: AuthUser) => {
  const nuxtApp = useNuxtApp()
  const { $api } = nuxtApp

  const permissions = await $api<PermissionsResponse>('/api/me/permissions').catch(() => null)

  nuxtApp.payload.auth = {
    user,
    impersonation: null,
    permissions: permissions ?? defaultPermissions,
  }
}

/**
 * Clears nuxtApp.payload.auth after logout.
 */
const clearAuthPayload = () => {
  const nuxtApp = useNuxtApp()
  nuxtApp.payload.auth = {
    user: null,
    impersonation: null,
    permissions: defaultPermissions,
  }
}

export const useLogin = () => {
  const queryCache = useQueryCache()
  const authApi = useAuthApi()

  return useMutation({
    mutation: (credentials: LoginCredentials) => authApi.login(credentials),
    onSuccess: async (response) => {
      await updateAuthPayload(response.user)
    },
    onSettled: () => {
      queryCache.invalidateQueries({ key: authKeys.session() })
    },
  })
}

export const useRegister = () => {
  const queryCache = useQueryCache()
  const authApi = useAuthApi()

  return useMutation({
    mutation: (credentials: RegisterCredentials) => authApi.register(credentials),
    onSuccess: async (response) => {
      await updateAuthPayload(response.user)
    },
    onSettled: () => {
      queryCache.invalidateQueries({ key: authKeys.session() })
    },
  })
}

export const useLogout = () => {
  const queryCache = useQueryCache()
  const authApi = useAuthApi()

  return useMutation({
    mutation: () => authApi.logout(),
    onSuccess: () => {
      clearAuthPayload()
    },
    onSettled: () => {
      queryCache.invalidateQueries({ key: authKeys.session() })
    },
  })
}

export const useForgotPassword = () => {
  const authApi = useAuthApi()

  return useMutation({
    mutation: (credentials: ForgotPasswordCredentials) => authApi.forgotPassword(credentials),
  })
}

export const useResetPassword = () => {
  const queryCache = useQueryCache()
  const authApi = useAuthApi()

  return useMutation({
    mutation: (credentials: ResetPasswordCredentials) => authApi.resetPassword(credentials),
    onSettled: () => {
      queryCache.invalidateQueries({ key: authKeys.session() })
    },
  })
}

export const useResendVerification = () => {
  const authApi = useAuthApi()

  return useMutation({
    mutation: () => authApi.resendVerification(),
  })
}
