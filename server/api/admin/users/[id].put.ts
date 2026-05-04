import * as z from 'zod'
import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

const schema = z.object({
  name: z.string().trim().min(1).max(100).nullable(),
  email: z.email().trim().max(255),
  emailVerified: z.boolean(),
})

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'User ID is required',
    })
  }

  const body = await readBody(event)
  const data = schema.parse(body)

  // Check if user exists
  const existing = await container.items.users.findOne({
    id: { _eq: id },
  })

  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found',
    })
  }

  // Check if email already exists (excluding current user)
  const emailExists = await container.items.users.findOne({
    email: { _eq: data.email },
    id: { _neq: id },
  })

  if (emailExists) {
    throw createError({
      statusCode: 409,
      statusMessage: 'A user with this email already exists',
    })
  }

  const user = await container.items.users.update(id, {
    name: data.name,
    email: data.email,
    emailVerified: data.emailVerified,
  })

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
  }
})
