import type { CreateBlogCategoryInput, UpdateBlogCategoryInput } from '../types/admin.types'
import { useMutation, useQueryCache } from '@pinia/colada'
import { useAdminApi } from '../api/admin.api'
import { adminKeys } from '../api/admin.keys'

export const useCreateBlogCategory = () => {
  const queryCache = useQueryCache()
  const adminApi = useAdminApi()

  return useMutation({
    mutation: (data: CreateBlogCategoryInput) => adminApi.createBlogCategory(data),
    onSettled: () => {
      queryCache.invalidateQueries({ key: adminKeys.blogCategories() })
    },
  })
}

export const useUpdateBlogCategory = () => {
  const queryCache = useQueryCache()
  const adminApi = useAdminApi()

  return useMutation({
    mutation: ({ id, data }: { id: string, data: UpdateBlogCategoryInput }) =>
      adminApi.updateBlogCategory(id, data),
    onSettled: () => {
      queryCache.invalidateQueries({ key: adminKeys.blogCategories() })
      queryCache.invalidateQueries({ key: adminKeys.blogPosts() })
    },
  })
}

export const useDeleteBlogCategory = () => {
  const queryCache = useQueryCache()
  const adminApi = useAdminApi()

  return useMutation({
    mutation: (id: string) => adminApi.deleteBlogCategory(id),
    onSettled: () => {
      queryCache.invalidateQueries({ key: adminKeys.blogCategories() })
      queryCache.invalidateQueries({ key: adminKeys.blogPosts() })
    },
  })
}
