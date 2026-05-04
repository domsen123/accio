export interface ValidateInvitationResponse {
  valid: boolean
  email?: string
  organisationName?: string
}

export interface AcceptInvitationInput {
  password: string
  name?: string
}

export interface AcceptInvitationResponse {
  success: boolean
  user: { id: string, email: string, name: string | null }
  organisationId: string
  organisationName: string
}

export interface OrganisationInvitation {
  id: string
  email: string
  role: { id: string, name: string } | null
  invitedBy: { id: string, name: string | null } | null
  expiresAt: string
  createdAt: string
  isExpired: boolean
  acceptLink: string
}

export interface OrganisationInvitationsResponse {
  invitations: OrganisationInvitation[]
  total: number
}

export const useOrganisationInvitationsApi = () => {
  const { $api } = useNuxtApp()

  return {
    // Public routes (for invitation acceptance flow)
    validateInvitation: (token: string): Promise<ValidateInvitationResponse> =>
      $api(`/api/auth/invitations/${token}/validate`),

    acceptInvitation: (token: string, data: AcceptInvitationInput): Promise<AcceptInvitationResponse> =>
      $api(`/api/auth/invitations/${token}/accept`, {
        method: 'POST',
        body: data,
      }),

    // Admin routes
    getInvitations: (organisationId: string): Promise<OrganisationInvitationsResponse> =>
      $api(`/api/admin/organisations/${organisationId}/invitations`),

    revokeInvitation: (organisationId: string, invitationId: string): Promise<{ success: boolean }> =>
      $api(`/api/admin/organisations/${organisationId}/invitations/${invitationId}`, {
        method: 'DELETE',
      }),

    resendInvitation: (organisationId: string, invitationId: string): Promise<{ success: boolean }> =>
      $api(`/api/admin/organisations/${organisationId}/invitations/${invitationId}/resend`, {
        method: 'POST',
      }),
  }
}
