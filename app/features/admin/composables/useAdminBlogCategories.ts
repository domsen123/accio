import type { MaybeRefOrGetter } from 'vue'
import type { AdminBlogCategoriesQueryParams } from '../types/admin.types'
import { useQuery } from '@pinia/colada'
import { useAdminApi } from '../api/admin.api'
import { adminKeys } from '../api/admin.keys'

export const useAdminBlogCategories = (params?: MaybeRefOrGetter<AdminBlogCategoriesQueryParams>) => {
  const adminApi = useAdminApi()

  const query = useQuery({
    key: () => adminKeys.blogCategories(toValue(params)),
    query: () => adminApi.getBlogCategories(toValue(params)),
    staleTime: 2 * 60 * 1000,
  })

  const categories = computed(() =>
    query.data.value?.categories ?? [],
  )

  const total = computed(() =>
    query.data.value?.total ?? 0,
  )

  return {
    ...query,
    categories,
    total,
  }
}
