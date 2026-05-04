import { container } from '~~/server/utils/container'

export default defineTask({
  meta: {
    name: 'cleanup:tokens',
    description: 'Clean up expired tokens from the database',
  },
  async run() {
    const { authService, profileService, organisationInvitationsService } = container

    const results = {
      resetTokens: await authService.cleanupExpiredResetTokens(),
      verificationTokens: await authService.cleanupExpiredVerificationTokens(),
      emailChanges: await profileService.cleanupExpiredEmailChanges(),
      invitations: await organisationInvitationsService.cleanupExpiredInvitations(),
    }

    console.log('[cleanup:tokens] Cleanup completed:', results)

    return { result: results }
  },
})
