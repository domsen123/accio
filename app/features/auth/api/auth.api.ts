import type {
  AuthResponse,
  ForgotPasswordCredentials,
  ForgotPasswordResponse,
  LoginCredentials,
  LogoutOtherSessionsResponse,
  RegisterCredentials,
  ResendVerificationResponse,
  ResetPasswordCredentials,
  ResetPasswordResponse,
  RevokeSessionResponse,
  SessionResponse,
  SessionsResponse,
  ValidateResetTokenResponse,
} from '../types/auth.types'

export const useAuthApi = () => {
  const { $api } = useNuxtApp()

  return {
    login: (credentials: LoginCredentials): Promise<AuthResponse> =>
      $api('/api/auth/login', {
        method: 'POST',
        body: credentials,
      }),

    register: (credentials: RegisterCredentials): Promise<AuthResponse> =>
      $api('/api/auth/register', {
        method: 'POST',
        body: credentials,
      }),

    logout: (): Promise<{ success: boolean }> =>
      $api('/api/auth/logout', {
        method: 'POST',
      }),

    getSession: (): Promise<SessionResponse> =>
      $api('/api/auth/session'),

    forgotPassword: (credentials: ForgotPasswordCredentials): Promise<ForgotPasswordResponse> =>
      $api('/api/auth/forgot-password', {
        method: 'POST',
        body: credentials,
      }),

    resetPassword: (credentials: ResetPasswordCredentials): Promise<ResetPasswordResponse> =>
      $api('/api/auth/reset-password', {
        method: 'POST',
        body: credentials,
      }),

    validateResetToken: (token: string): Promise<ValidateResetTokenResponse> =>
      $api('/api/auth/validate-reset-token', {
        query: { token },
      }),

    resendVerification: (): Promise<ResendVerificationResponse> =>
      $api('/api/auth/resend-verification', {
        method: 'POST',
      }),

    // Session management
    getSessions: (): Promise<SessionsResponse> =>
      $api('/api/auth/sessions'),

    logoutOtherSessions: (): Promise<LogoutOtherSessionsResponse> =>
      $api('/api/auth/sessions/others', {
        method: 'DELETE',
      }),

    revokeSession: (sessionId: string): Promise<RevokeSessionResponse> =>
      $api(`/api/auth/sessions/${sessionId}`, {
        method: 'DELETE',
      }),
  }
}
