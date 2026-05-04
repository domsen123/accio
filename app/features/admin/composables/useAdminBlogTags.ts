import type { MaybeRefOrGetter } from 'vue'
import type { AdminBlogTagsQueryParams } from '../types/admin.types'
import { useQuery } from '@pinia/colada'
import { useAdminApi } from '../api/admin.api'
import { adminKeys } from '../api/admin.keys'

export const useAdminBlogTags = (params?: MaybeRefOrGetter<AdminBlogTagsQueryParams>) => {
  const adminApi = useAdminApi()

  const query = useQuery({
    key: () => adminKeys.blogTags(toValue(params)),
    query: () => adminApi.getBlogTags(toValue(params)),
    staleTime: 2 * 60 * 1000,
  })

  const tags = computed(() =>
    query.data.value?.tags ?? [],
  )

  const total = computed(() =>
    query.data.value?.total ?? 0,
  )

  return {
    ...query,
    tags,
    total,
  }
}
