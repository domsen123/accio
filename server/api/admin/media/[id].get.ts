import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'File ID is required' })
  }

  const file = await container.mediaLibraryService.getMediaFile(id)
  if (!file) {
    throw createError({ statusCode: 404, statusMessage: 'Media file not found' })
  }

  return { file }
})
