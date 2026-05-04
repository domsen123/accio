export const organisationMembersKeys = {
  all: ['organisation-members'] as const,
  members: (organisationId: string) => [...organisationMembersKeys.all, 'members', organisationId] as const,
  roles: (organisationId: string) => [...organisationMembersKeys.all, 'roles', organisationId] as const,
}
