import { requireAuth } from '~~/server/features/auth/auth.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing file ID' })
  }

  // Check ownership
  const file = await container.fileService.getFile(id)
  if (!file) {
    throw createError({ statusCode: 404, statusMessage: 'File not found' })
  }

  if (file.uploadedBy !== user.id) {
    throw createError({ statusCode: 403, statusMessage: 'Not authorized to delete this file' })
  }

  if (file.parentId) {
    throw createError({ statusCode: 400, statusMessage: 'Cannot delete a variant directly. Delete the parent file instead.' })
  }

  await container.fileService.deleteFile(id)

  return { success: true }
})
