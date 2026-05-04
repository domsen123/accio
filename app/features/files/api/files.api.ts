import type { FileListResponse, FileUploadResponse } from '../types/files.types'

export interface UploadFileParams {
  file: File
  entityType?: string
  entityId?: string
}

export const useFilesApi = () => {
  const { $api } = useNuxtApp()

  return {
    upload: (params: UploadFileParams): Promise<FileUploadResponse> => {
      const formData = new FormData()
      formData.append('file', params.file)
      if (params.entityType)
        formData.append('entityType', params.entityType)
      if (params.entityId)
        formData.append('entityId', params.entityId)

      return $api('/api/files/upload', {
        method: 'POST',
        body: formData,
      })
    },

    getFilesByEntity: (entityType: string, entityId: string, options?: { includeVariants?: boolean }): Promise<FileListResponse> =>
      $api('/api/files/entity', {
        query: { entityType, entityId, includeVariants: options?.includeVariants },
      }),

    deleteFile: (id: string): Promise<{ success: boolean }> =>
      $api(`/api/files/${id}`, {
        method: 'DELETE',
      }),
  }
}
