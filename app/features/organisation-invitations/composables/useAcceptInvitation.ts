import type { AcceptInvitationInput } from '../api/organisation-invitations.api'
import type { PermissionsResponse } from '~/features/permissions/types/permissions.types'
import { useMutation, useQueryCache } from '@pinia/colada'
import { authKeys } from '~/features/auth/api/auth.keys'
import { useOrganisationInvitationsApi } from '../api/organisation-invitations.api'

const defaultPermissions: PermissionsResponse = {
  userId: '',
  global: [],
  organisations: {},
  teams: {},
}

export const useAcceptInvitation = () => {
  const queryCache = useQueryCache()
  const api = useOrganisationInvitationsApi()

  return useMutation({
    mutation: ({ token, data }: { token: string, data: AcceptInvitationInput }) =>
      api.acceptInvitation(token, data),
    onSuccess: async (response) => {
      // Update auth payload after successful acceptance (user is auto-logged in)
      const nuxtApp = useNuxtApp()
      const { $api } = nuxtApp

      const permissions = await $api<PermissionsResponse>('/api/me/permissions').catch(() => null)

      nuxtApp.payload.auth = {
        user: response.user,
        impersonation: null,
        permissions: permissions ?? defaultPermissions,
      }
    },
    onSettled: () => {
      queryCache.invalidateQueries({ key: authKeys.session() })
    },
  })
}
