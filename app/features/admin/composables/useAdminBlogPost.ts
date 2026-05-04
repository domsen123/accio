import type { MaybeRefOrGetter } from 'vue'
import { useQuery } from '@pinia/colada'
import { useAdminApi } from '../api/admin.api'
import { adminKeys } from '../api/admin.keys'

export const useAdminBlogPost = (id: MaybeRefOrGetter<string>) => {
  const adminApi = useAdminApi()

  const query = useQuery({
    key: () => adminKeys.blogPost(toValue(id)),
    query: () => adminApi.getBlogPost(toValue(id)),
    staleTime: 2 * 60 * 1000,
  })

  const post = computed(() => query.data.value?.post ?? null)

  return {
    ...query,
    post,
  }
}
