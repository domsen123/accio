import type { CreateBlogTagInput, UpdateBlogTagInput } from '../types/admin.types'
import { useMutation, useQueryCache } from '@pinia/colada'
import { useAdminApi } from '../api/admin.api'
import { adminKeys } from '../api/admin.keys'

export const useCreateBlogTag = () => {
  const queryCache = useQueryCache()
  const adminApi = useAdminApi()

  return useMutation({
    mutation: (data: CreateBlogTagInput) => adminApi.createBlogTag(data),
    onSettled: () => {
      queryCache.invalidateQueries({ key: adminKeys.blogTags() })
    },
  })
}

export const useUpdateBlogTag = () => {
  const queryCache = useQueryCache()
  const adminApi = useAdminApi()

  return useMutation({
    mutation: ({ id, data }: { id: string, data: UpdateBlogTagInput }) =>
      adminApi.updateBlogTag(id, data),
    onSettled: () => {
      queryCache.invalidateQueries({ key: adminKeys.blogTags() })
    },
  })
}

export const useDeleteBlogTag = () => {
  const queryCache = useQueryCache()
  const adminApi = useAdminApi()

  return useMutation({
    mutation: (id: string) => adminApi.deleteBlogTag(id),
    onSettled: () => {
      queryCache.invalidateQueries({ key: adminKeys.blogTags() })
    },
  })
}
