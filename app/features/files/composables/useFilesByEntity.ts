import { useQuery } from '@pinia/colada'
import { useFilesApi } from '../api/files.api'
import { filesKeys } from '../api/files.keys'

export const useFilesByEntity = (entityType: MaybeRef<string>, entityId: MaybeRef<string>, options?: { includeVariants?: boolean }) => {
  const filesApi = useFilesApi()

  const query = useQuery({
    key: () => [...filesKeys.entity(toValue(entityType), toValue(entityId)), { includeVariants: options?.includeVariants }],
    query: () => filesApi.getFilesByEntity(toValue(entityType), toValue(entityId), options),
    staleTime: 2 * 60 * 1000,
  })

  const files = computed(() => query.data.value?.files ?? [])

  return {
    ...query,
    files,
  }
}
