import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing file ID' })
  }

  const content = await container.fileService.getFileContent(id)
  if (!content) {
    throw createError({ statusCode: 404, statusMessage: 'File not found' })
  }

  setHeaders(event, {
    'Content-Type': content.mimeType,
    'Cache-Control': 'public, max-age=31536000, immutable',
  })

  return content.buffer
})
