import * as z from 'zod'
import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

const schema = z.object({
  provider: z.enum(['anthropic', 'google']),
  model: z.string().trim().min(1).nullable().optional(),
  apiKey: z.string().trim().min(1).optional(),
  language: z.enum(['en', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'pl', 'ja', 'ko', 'zh', 'ru', 'ar', 'tr', 'sv', 'da', 'no']).default('en'),
  brandVoice: z.string().trim().transform(v => v || null).nullable().optional(),
  productionInterval: z.enum(['every3days', 'weekly', 'biweekly']).default('weekly'),
  productionEnabled: z.boolean().default(false),
})

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const body = await readBody(event)
  const data = schema.parse(body)

  const settings = await container.contentCreatorService.saveSettings(data)

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
