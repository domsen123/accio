import type {
  AddMemberInput,
  InviteMemberInput,
  InviteMemberResponse,
  OrganisationMemberResponse,
  OrganisationMembersResponse,
  OrganisationRolesResponse,
  UpdateMemberRoleInput,
} from '../types/organisation-members.types'

export const useOrganisationMembersApi = () => {
  const { $api } = useNuxtApp()

  return {
    // Admin routes
    getMembers: (organisationId: string): Promise<OrganisationMembersResponse> =>
      $api(`/api/admin/organisations/${organisationId}/members`),

    addMember: (organisationId: string, data: AddMemberInput): Promise<OrganisationMemberResponse> =>
      $api(`/api/admin/organisations/${organisationId}/members`, {
        method: 'POST',
        body: data,
      }),

    updateMemberRole: (
      organisationId: string,
      userId: string,
      data: UpdateMemberRoleInput,
    ): Promise<OrganisationMemberResponse> =>
      $api(`/api/admin/organisations/${organisationId}/members/${userId}`, {
        method: 'PUT',
        body: data,
      }),

    removeMember: (organisationId: string, userId: string): Promise<{ success: boolean }> =>
      $api(`/api/admin/organisations/${organisationId}/members/${userId}`, {
        method: 'DELETE',
      }),

    inviteMember: (organisationId: string, data: InviteMemberInput): Promise<InviteMemberResponse> =>
      $api(`/api/admin/organisations/${organisationId}/members/invite`, {
        method: 'POST',
        body: data,
      }),

    getRoles: (organisationId: string): Promise<OrganisationRolesResponse> =>
      $api(`/api/admin/organisations/${organisationId}/roles`),
  }
}
