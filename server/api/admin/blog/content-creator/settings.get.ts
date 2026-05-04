import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const settings = await container.contentCreatorService.getSettings()

  if (!settings) {
    return { settings: null }
  }

  return {
    settings: {
      id: settings.id,
      provider: settings.provider,
      model: settings.model,
      hasApiKey: true,
      language: settings.language,
      brandVoice: settings.brandVoice,
      productionInterval: settings.productionInterval,
      productionEnabled: settings.productionEnabled,
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt,
    },
  }
})
