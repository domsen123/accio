import { setSessionCookie } from '../features/auth/session.utils'
import { container } from '../utils/container'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:response', async (_response, { event }) => {
    // Skip if user already authenticated (existing cookie worked)
    if (event.context.user)
      return

    // Skip non-document requests (API calls, assets, etc.)
    if (!event.path || event.path.startsWith('/api/') || event.path.startsWith('/_'))
      return

    const anonConfig = await container.authProvidersService.getAnonymousConfig()
    if (!anonConfig.enabled)
      return

    const result = await container.authService.createAnonymousUser(anonConfig.sessionDurationDays)

    setSessionCookie(event, result.token, result.session.expiresAt)

    event.context.user = result.user
    event.context.session = result.session
  })
})
