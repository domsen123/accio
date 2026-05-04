import type { MaybeRefOrGetter } from 'vue'
import type { AdminBlogPostsQueryParams } from '../types/admin.types'
import { useQuery } from '@pinia/colada'
import { useAdminApi } from '../api/admin.api'
import { adminKeys } from '../api/admin.keys'

export const useAdminBlogPosts = (params?: MaybeRefOrGetter<AdminBlogPostsQueryParams>) => {
  const adminApi = useAdminApi()

  const query = useQuery({
    key: () => adminKeys.blogPosts(toValue(params)),
    query: () => adminApi.getBlogPosts(toValue(params)),
    staleTime: 2 * 60 * 1000,
  })

  const posts = computed(() =>
    query.data.value?.posts ?? [],
  )

  const total = computed(() =>
    query.data.value?.total ?? 0,
  )

  return {
    ...query,
    posts,
    total,
  }
}
