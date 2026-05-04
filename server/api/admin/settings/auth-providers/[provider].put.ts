import * as z from 'zod'
import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

const schema = z.object({
  enabled: z.boolean(),
  config: z.record(z.string(), z.unknown()),
})

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const provider = getRouterParam(event, 'provider')

  if (!provider) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Provider name is required',
    })
  }

  const body = await readBody(event)
  const data = schema.parse(body)

  const updated = await container.authProvidersService.updateProvider(provider, data)

  return { provider: updated }
})
