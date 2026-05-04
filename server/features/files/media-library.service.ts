import type { fileMetadata, files } from '~~/server/database/schema'
import type { ItemService } from '~~/server/infrastructure/database/item-service'
import type { Config } from '~~/server/utils/config'

export interface MediaFileResult {
  id: string
  filename: string
  originalName: string
  mimeType: string
  size: number
  url: string
  entityType: string | null
  createdAt: Date
  updatedAt: Date
  metadata: {
    id: string
    alt: string | null
    title: string | null
    description: string | null
    focusX: number
    focusY: number
  } | null
}

export interface ListMediaFilesOptions {
  search?: string
  sort?: string[]
  limit?: number
  offset?: number
}

export interface UpsertMetadataInput {
  alt?: string | null
  title?: string | null
  description?: string | null
  focusX?: number
  focusY?: number
}

export interface CreateMediaLibraryServiceDeps {
  filesItemService: ItemService<typeof files>
  fileMetadataItemService: ItemService<typeof fileMetadata>
  config: Config
}

export const createMediaLibraryService = (deps: CreateMediaLibraryServiceDeps) => {
  const { filesItemService, fileMetadataItemService, config } = deps

  const toMediaFile = (
    file: typeof files.$inferSelect,
    meta: typeof fileMetadata.$inferSelect | null,
  ): MediaFileResult => ({
    id: file.id,
    filename: file.filename,
    originalName: file.originalName,
    mimeType: file.mimeType,
    size: file.size,
    url: `${config.site.url}/api/files/${file.id}`,
    entityType: file.entityType,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
    metadata: meta
      ? {
          id: meta.id,
          alt: meta.alt,
          title: meta.title,
          description: meta.description,
          focusX: meta.focusX,
          focusY: meta.focusY,
        }
      : null,
  })

  const listMediaFiles = async (options: ListMediaFilesOptions = {}): Promise<{ files: MediaFileResult[], total: number }> => {
    const { search, sort = ['-createdAt'], limit, offset } = options

    const baseFilter: Record<string, unknown> = {
      entityType: { _eq: 'media-library' },
      parentId: { _null: true },
    }

    const filter = search
      ? {
          _and: [
            baseFilter,
            {
              _or: [
                { originalName: { _ilike: `%${search}%` } },
                { filename: { _ilike: `%${search}%` } },
              ],
            },
          ],
        }
      : baseFilter

    const [mediaFiles, total] = await Promise.all([
      filesItemService.findMany({ filter, sort, limit, offset }),
      filesItemService.count(filter),
    ])

    if (mediaFiles.length === 0) {
      return { files: [], total }
    }

    // Batch-fetch metadata for all files
    const fileIds = mediaFiles.map(f => f.id)
    const metadataRecords = await fileMetadataItemService.findMany({
      filter: { fileId: { _in: fileIds } },
    })
    const metadataMap = new Map(metadataRecords.map(m => [m.fileId, m]))

    return {
      files: mediaFiles.map(f => toMediaFile(f, metadataMap.get(f.id) ?? null)),
      total,
    }
  }

  const getMediaFile = async (id: string): Promise<MediaFileResult | null> => {
    const file = await filesItemService.readOne(id)
    if (!file)
      return null

    const metadataRecords = await fileMetadataItemService.findMany({
      filter: { fileId: { _eq: id } },
      limit: 1,
    })

    return toMediaFile(file, metadataRecords[0] ?? null)
  }

  const upsertMetadata = async (fileId: string, input: UpsertMetadataInput): Promise<MediaFileResult> => {
    const file = await filesItemService.readOne(fileId)
    if (!file) {
      throw createError({ statusCode: 404, statusMessage: 'File not found' })
    }

    const existing = await fileMetadataItemService.findMany({
      filter: { fileId: { _eq: fileId } },
      limit: 1,
    })

    let meta: typeof fileMetadata.$inferSelect
    if (existing.length > 0) {
      meta = await fileMetadataItemService.update(existing[0]!.id, {
        ...(input.alt !== undefined ? { alt: input.alt } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.focusX !== undefined ? { focusX: input.focusX } : {}),
        ...(input.focusY !== undefined ? { focusY: input.focusY } : {}),
      })
    }
    else {
      meta = await fileMetadataItemService.create({
        fileId,
        alt: input.alt ?? null,
        title: input.title ?? null,
        description: input.description ?? null,
        focusX: input.focusX ?? 0.5,
        focusY: input.focusY ?? 0.5,
      })
    }

    return toMediaFile(file, meta)
  }

  return {
    listMediaFiles,
    getMediaFile,
    upsertMetadata,
  }
}

export type MediaLibraryService = ReturnType<typeof createMediaLibraryService>
