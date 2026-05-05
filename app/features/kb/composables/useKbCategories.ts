import { useQuery } from '@pinia/colada'
import { useKbApi } from '../api/kb.api'
import { kbKeys } from '../api/kb.keys'

/**
 * Flat list of workspace categories. The categories tree UI lands in T-1.11;
 * for T-1.8 we present a flat single-select.
 */
export const useKbCategories = () => {
  const kbApi = useKbApi()

  const query = useQuery({
    key: () => kbKeys.categories(),
    query: () => kbApi.listCategories(),
    staleTime: 5 * 60 * 1000,
  })

  const categories = computed(() => query.data.value?.data ?? [])

  return {
    ...query,
    categories,
  }
}
