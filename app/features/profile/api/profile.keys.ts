export const profileKeys = {
  all: ['profile'] as const,
  profile: () => [...profileKeys.all, 'current'] as const,
  pendingEmailChange: () => [...profileKeys.all, 'pending-email-change'] as const,
}
