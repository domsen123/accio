export const permissionsKeys = {
  all: ['permissions'] as const,
  my: () => [...permissionsKeys.all, 'me'] as const,
}
