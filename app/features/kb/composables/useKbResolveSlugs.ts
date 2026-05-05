/**
 * Resolve a list of wikilink target slugs to "exists in this workspace?" via
 * the bulk endpoint added in T-1.9. Used by the Markdown preview to give
 * unresolved links a visual marker.
 *
 * The query is keyed by the **sorted** slug list so reordering or
 * duplicate-only changes don't bust the cache. An empty input short-circuits
 * to `{ resolved: [] }` without a network call.
 */
import type { MaybeRefOrGetter } from 'vue'
import { useQuery } from '@pinia/colada'
import { kbKeys } from '../api/kb.keys'

interface ResolveSlugsResponse {
  resolved: string[]
}

const normalise = (slugs: string[]): string[] => {
  const unique = [...new Set(slugs.map(s => s.trim()).filter(Boolean))]
  return unique.sort()
}

export const useKbResolveSlugs = (slugs: MaybeRefOrGetter<string[]>) => {
  const { $api } = useNuxtApp()

  const slugList = computed(() => normalise(toValue(slugs)))

  const query = useQuery({
    key: () => [...kbKeys.all, 'resolve', slugList.value] as const,
    query: async (): Promise<ResolveSlugsResponse> => {
      if (slugList.value.length === 0)
        return { resolved: [] as string[] }
      return $api<ResolveSlugsResponse>('/api/kb/resolve-slugs', {
        query: { slugs: slugList.value.join(',') },
      })
    },
    staleTime: 30 * 1000,
  })

  const resolvedSet = computed(
    () => new Set(query.data.value?.resolved ?? []),
  )

  const isResolved = (slug: string): boolean =>
    resolvedSet.value.has(slug.trim())

  return {
    ...query,
    resolvedSet,
    isResolved,
  }
}
