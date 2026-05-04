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
  createdAt: string
  updatedAt: string
}

export interface FileUploadResponse {
  file: FileMetadata
}

export interface FileListResponse {
  files: FileMetadata[]
}
