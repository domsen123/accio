import * as z from 'zod'
import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

const createTeamSchema = z.object({
  name: z.string().trim().min(1, 'Team name is required').max(100, 'Team name must be 100 characters or less'),
})

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Organisation ID is required' })
  }

  // Verify organisation exists
  const org = await container.items.organisations.readOne(id)
  if (!org) {
    throw createError({ statusCode: 404, statusMessage: 'Organisation not found' })
  }

  const body = await readBody(event)
  const parsed = createTeamSchema.safeParse(body)

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message ?? 'Invalid input',
    })
  }

  const team = await container.items.teams.create({
    name: parsed.data.name,
    organisationId: id,
  })

  return { team }
})
