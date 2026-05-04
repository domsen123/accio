import type { Buffer } from 'node:buffer'

export interface FileStoreMetadata {
  mimeType: string
  originalName?: string
}

export interface FileStoreGetResult {
  buffer: Buffer
  mimeType: string
}

export interface FileStoreProvider {
  put: (key: string, buffer: Buffer, metadata: FileStoreMetadata) => Promise<void>
  get: (key: string) => Promise<FileStoreGetResult>
  delete: (key: string) => Promise<void>
  exists: (key: string) => Promise<boolean>
}
