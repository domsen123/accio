export interface AuthUser {
  id: string
  email: string | null
  name: string | null
  authProvider: string
  emailVerified: boolean
  createdAt: string
  updatedAt: string
}

export interface LoginCredentials {
  email: string
  password: string
  remember?: boolean
}

export interface RegisterCredentials {
  email: string
  password: string
  name?: string
}

export interface AuthResponse {
  user: AuthUser
}

export interface ImpersonationInfo {
  originalUserId: string
  originalSessionId: string | null
}

export interface SessionResponse {
  user: AuthUser | null
  impersonation: ImpersonationInfo | null
}

export interface ForgotPasswordCredentials {
  email: string
}

export interface ResetPasswordCredentials {
  token: string
  password: string
}

export interface ForgotPasswordResponse {
  success: boolean
  message: string
}

export interface ResetPasswordResponse {
  success: boolean
  message: string
}

export interface ValidateResetTokenResponse {
  valid: boolean
}

export interface ResendVerificationResponse {
  success: boolean
  message: string
}

// Session management types
export interface SessionInfo {
  id: string
  userAgent: string | null
  ipAddress: string | null
  createdAt: string
  expiresAt: string
  isCurrent: boolean
}

export interface SessionsResponse {
  sessions: SessionInfo[]
}

export interface LogoutOtherSessionsResponse {
  success: boolean
  count: number
  message: string
}

export interface RevokeSessionResponse {
  success: boolean
  message: string
}

export interface DeviceInfo {
  browser: string
  os: string
  device: string
}
