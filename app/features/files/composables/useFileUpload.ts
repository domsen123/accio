import type { UploadFileParams } from '../api/files.api'
import { useMutation, useQueryCache } from '@pinia/colada'
import { useFilesApi } from '../api/files.api'
import { filesKeys } from '../api/files.keys'

export const useUploadFile = () => {
  const queryCache = useQueryCache()
  const filesApi = useFilesApi()

  return useMutation({
    mutation: (params: UploadFileParams) => filesApi.upload(params),
    onSettled: (_data, _error, params) => {
      if (params.entityType && params.entityId) {
        queryCache.invalidateQueries({ key: filesKeys.entity(params.entityType, params.entityId) })
      }
    },
  })
}
