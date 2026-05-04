export interface UserProfile {
  id: string
  email: string
  name: string | null
  createdAt: string
  updatedAt: string
}

export interface ProfileResponse {
  profile: UserProfile
}

export interface UpdateProfileInput {
  name?: string
}

export interface ChangePasswordInput {
  currentPassword: string
  newPassword: string
}

// Email change types
export interface RequestEmailChangeInput {
  email: string
}

export interface RequestEmailChangeResponse {
  success: boolean
  message: string
}

export interface ConfirmEmailChangeResponse {
  success: boolean
  email: string
}

export interface PendingEmailChange {
  newEmail: string
  expiresAt: string
}

export interface PendingEmailChangeResponse {
  pending: PendingEmailChange | null
}
