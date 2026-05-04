import type { CreateBlogPostInput, UpdateBlogPostInput } from '../types/admin.types'
import { useMutation, useQueryCache } from '@pinia/colada'
import { useAdminApi } from '../api/admin.api'
import { adminKeys } from '../api/admin.keys'

export const useCreateBlogPost = () => {
  const queryCache = useQueryCache()
  const adminApi = useAdminApi()

  return useMutation({
    mutation: (data: CreateBlogPostInput) => adminApi.createBlogPost(data),
    onSettled: () => {
      queryCache.invalidateQueries({ key: adminKeys.blogPosts() })
    },
  })
}

export const useUpdateBlogPost = () => {
  const queryCache = useQueryCache()
  const adminApi = useAdminApi()

  return useMutation({
    mutation: ({ id, data }: { id: string, data: UpdateBlogPostInput }) =>
      adminApi.updateBlogPost(id, data),
    onSettled: (_data, _error, variables) => {
      queryCache.invalidateQueries({ key: adminKeys.blogPosts() })
      queryCache.invalidateQueries({ key: adminKeys.blogPost(variables.id) })
    },
  })
}

export const useDeleteBlogPost = () => {
  const queryCache = useQueryCache()
  const adminApi = useAdminApi()

  return useMutation({
    mutation: (id: string) => adminApi.deleteBlogPost(id),
    onSettled: () => {
      queryCache.invalidateQueries({ key: adminKeys.blogPosts() })
    },
  })
}
