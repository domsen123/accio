import { useMutation, useQueryCache } from '@pinia/colada'
import { useFilesApi } from '../api/files.api'
import { filesKeys } from '../api/files.keys'

export interface DeleteFileParams {
  id: string
  entityType?: string
  entityId?: string
}

export const useFileDelete = () => {
  const queryCache = useQueryCache()
  const filesApi = useFilesApi()

  return useMutation({
    mutation: (params: DeleteFileParams) => filesApi.deleteFile(params.id),
    onSettled: (_data, _error, params) => {
      if (params.entityType && params.entityId) {
        queryCache.invalidateQueries({ key: filesKeys.entity(params.entityType, params.entityId) })
      }
    },
  })
}
