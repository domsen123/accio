export const organisationInvitationsKeys = {
  all: ['organisation-invitations'] as const,
  validate: (token: string | null) => [...organisationInvitationsKeys.all, 'validate', token] as const,
  list: (organisationId: string) => [...organisationInvitationsKeys.all, 'list', organisationId] as const,
}
