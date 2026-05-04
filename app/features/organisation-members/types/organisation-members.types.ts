export interface OrganisationMemberUser {
  id: string
  email: string
  name: string | null
}

export interface OrganisationMemberRole {
  id: string
  name: string
}

export interface OrganisationMember {
  id: string
  organisationId: string
  userId: string
  createdAt: string
  updatedAt: string
  user: OrganisationMemberUser
  role: OrganisationMemberRole | null
}

export interface OrganisationRole {
  id: string
  name: string
  description: string | null
  isSystem: boolean
  isDefault: boolean
}

// API Responses
export interface OrganisationMembersResponse {
  members: OrganisationMember[]
  total: number
}

export interface OrganisationMemberResponse {
  member: OrganisationMember
}

export interface OrganisationRolesResponse {
  roles: OrganisationRole[]
}

export interface InviteMemberResponse {
  member?: OrganisationMember
  invited: boolean
  email: string
  invitationLink?: string
}

// API Inputs
export interface AddMemberInput {
  userId: string
  roleId: string
}

export interface UpdateMemberRoleInput {
  roleId: string
}

export interface InviteMemberInput {
  email: string
  roleId: string
  deliveryMethod?: 'email' | 'link'
}
