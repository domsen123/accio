import type { UpdateMediaMetadataInput } from '../types/admin.types'
import { useMutation, useQueryCache } from '@pinia/colada'
import { useAdminApi } from '../api/admin.api'
import { adminKeys } from '../api/admin.keys'

export const useUpdateMediaMetadata = () => {
  const queryCache = useQueryCache()
  const adminApi = useAdminApi()

  return useMutation({
    mutation: ({ id, data }: { id: string, data: UpdateMediaMetadataInput }) =>
      adminApi.updateMediaMetadata(id, data),
    onSettled: (_data, _error, variables) => {
      queryCache.invalidateQueries({ key: adminKeys.mediaFiles() })
      queryCache.invalidateQueries({ key: adminKeys.mediaFile(variables.id) })
    },
  })
}

export const useDeleteMediaFile = () => {
  const queryCache = useQueryCache()
  const adminApi = useAdminApi()

  return useMutation({
    mutation: (id: string) => adminApi.deleteMediaFile(id),
    onSettled: () => {
      queryCache.invalidateQueries({ key: adminKeys.mediaFiles() })
    },
  })
}
