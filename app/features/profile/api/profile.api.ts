import type {
  ChangePasswordInput,
  ConfirmEmailChangeResponse,
  PendingEmailChangeResponse,
  ProfileResponse,
  RequestEmailChangeInput,
  RequestEmailChangeResponse,
  UpdateProfileInput,
} from '../types/profile.types'

export const useProfileApi = () => {
  const { $api } = useNuxtApp()

  return {
    getProfile: (): Promise<ProfileResponse> =>
      $api('/api/profile'),

    updateProfile: (data: UpdateProfileInput): Promise<ProfileResponse> =>
      $api('/api/profile', {
        method: 'PUT',
        body: data,
      }),

    changePassword: (data: ChangePasswordInput): Promise<{ success: boolean }> =>
      $api('/api/profile/password', {
        method: 'PUT',
        body: data,
      }),

    // Email change methods
    requestEmailChange: (data: RequestEmailChangeInput): Promise<RequestEmailChangeResponse> =>
      $api('/api/profile/email/request-change', {
        method: 'POST',
        body: data,
      }),

    confirmEmailChange: (token: string): Promise<ConfirmEmailChangeResponse> =>
      $api('/api/profile/email/confirm', {
        query: { token },
      }),

    getPendingEmailChange: (): Promise<PendingEmailChangeResponse> =>
      $api('/api/profile/email/pending'),

    cancelEmailChange: (): Promise<{ success: boolean }> =>
      $api('/api/profile/email/cancel', {
        method: 'DELETE',
      }),
  }
}
