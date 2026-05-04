import type { Buffer } from 'node:buffer'
import type { files } from '~~/server/database/schema'
import type { ItemService } from '~~/server/infrastructure/database/item-service'
import type { Config } from '~~/server/utils/config'
import type { FileStoreProvider } from './file-store-provider.interface'
import path from 'node:path'
import { ulid } from 'ulid'

export interface UploadFileInput {
  buffer: Buffer
  originalName: string
  mimeType: string
  size: number
  uploadedBy: string
  entityType?: string
  entityId?: string
  parentId?: string
  variant?: string
}

export interface FileMetadata {
  id: string
  filename: string
  originalName: string
  mimeType: string
  size: number
  storagePath: string
  storageProvider: string
  uploadedBy: string | null
  entityType: string | null
  entityId: string | null
  parentId: string | null
  variant: string | null
  url: string
  createdAt: Date
  updatedAt: Date
}

export interface CreateFileServiceDeps {
  fileStoreProvider: FileStoreProvider
  filesItemService: ItemService<typeof files>
  config: Config
}

export const createFileService = (deps: CreateFileServiceDeps) => {
  const { fileStoreProvider, filesItemService, config } = deps

  const buildStorageKey = (input: UploadFileInput): string => {
    const ext = path.extname(input.originalName).toLowerCase()
    const safeName = path.basename(input.originalName, ext)
      .replace(/[^\w-]/g, '_')
      .slice(0, 50)
    const shortId = ulid().slice(-8).toLowerCase()
    const prefix = input.entityType && input.entityId
      ? `${input.entityType}/${input.entityId}`
      : 'general'
    return `${prefix}/${safeName}-${shortId}${ext}`
  }

  const toMetadata = (record: typeof files.$inferSelect): FileMetadata => ({
    id: record.id,
    filename: record.filename,
    originalName: record.originalName,
    mimeType: record.mimeType,
    size: record.size,
    storagePath: record.storagePath,
    storageProvider: record.storageProvider,
    uploadedBy: record.uploadedBy,
    entityType: record.entityType,
    entityId: record.entityId,
    parentId: record.parentId,
    variant: record.variant,
    url: `${config.site.url}/api/files/${record.id}`,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  })

  const upload = async (input: UploadFileInput): Promise<FileMetadata> => {
    // Validate file size
    if (input.size > config.storage.maxFileSize) {
      throw createError({
        statusCode: 400,
        statusMessage: `File too large. Maximum size is ${Math.round(config.storage.maxFileSize / 1024 / 1024)}MB`,
      })
    }

    // Validate mime type
    if (!config.storage.allowedMimeTypes.includes(input.mimeType)) {
      throw createError({
        statusCode: 400,
        statusMessage: `File type not allowed. Allowed types: ${config.storage.allowedMimeTypes.join(', ')}`,
      })
    }

    const storagePath = buildStorageKey(input)

    // Store the file
    await fileStoreProvider.put(storagePath, input.buffer, {
      mimeType: input.mimeType,
      originalName: input.originalName,
    })

    // Create DB record
    const record = await filesItemService.create({
      filename: path.basename(storagePath),
      originalName: input.originalName,
      mimeType: input.mimeType,
      size: input.size,
      storagePath,
      storageProvider: config.storage.provider,
      uploadedBy: input.uploadedBy,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      parentId: input.parentId ?? null,
      variant: input.variant ?? null,
    })

    return toMetadata(record)
  }

  const getFile = async (id: string): Promise<FileMetadata | null> => {
    const record = await filesItemService.readOne(id)
    if (!record)
      return null
    return toMetadata(record)
  }

  const getFilesByEntity = async (entityType: string, entityId: string, options?: { includeVariants?: boolean }): Promise<FileMetadata[]> => {
    const records = await filesItemService.findMany({
      filter: { entityType, entityId },
      sort: ['-createdAt'],
    })
    const all = records.map(toMetadata)
    if (options?.includeVariants)
      return all
    // By default, exclude variant children (parentId !== null)
    return all.filter(f => !f.parentId)
  }

  const deleteFile = async (id: string): Promise<void> => {
    const record = await filesItemService.readOne(id)
    if (!record) {
      throw createError({ statusCode: 404, statusMessage: 'File not found' })
    }

    // If this is a parent file, delete variant storage files first (DB cascade handles records)
    if (!record.parentId) {
      const variants = await filesItemService.findMany({
        filter: { parentId: id },
      })
      await Promise.all(
        variants.map(v => fileStoreProvider.delete(v.storagePath)),
      )
    }

    // Delete from store
    await fileStoreProvider.delete(record.storagePath)

    // Delete from DB (cascade will remove variant records for parent files)
    await filesItemService.delete(id)
  }

  const getFileContent = async (id: string): Promise<{ buffer: Buffer, mimeType: string } | null> => {
    const record = await filesItemService.readOne(id)
    if (!record)
      return null
    const content = await fileStoreProvider.get(record.storagePath)
    return { buffer: content.buffer, mimeType: record.mimeType }
  }

  return {
    upload,
    getFile,
    getFilesByEntity,
    deleteFile,
    getFileContent,
  }
}

export type FileService = ReturnType<typeof createFileService>
