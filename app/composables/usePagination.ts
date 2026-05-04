import type { ComputedRef, Ref } from 'vue'

/**
 * Represents a single sort column with direction
 */
export interface SortColumn {
  key: string
  direction: 'asc' | 'desc'
}

export interface UsePaginationOptions {
  // Pagination
  defaultPerPage?: number
  perPageOptions?: number[]
  pageParam?: string
  perPageParam?: string

  // Search
  searchParam?: string
  searchDebounce?: number

  // Sorting
  sortParam?: string
  defaultSort?: SortColumn[]
  maxSortColumns?: number

  // Behavior
  resetOnChange?: (Ref<unknown> | ComputedRef<unknown>)[]
}

export interface UsePaginationReturn {
  // Pagination
  page: Ref<number>
  perPage: Ref<number>
  limit: ComputedRef<number>
  offset: ComputedRef<number>
  perPageOptions: number[]

  // Search
  search: Ref<string>
  searchDebounced: Readonly<Ref<string>>

  // Sort
  sort: Ref<SortColumn[]>
  sortApi: ComputedRef<string[]>

  // Sort helpers
  handleSort: (key: string, event?: MouseEvent | KeyboardEvent) => void
  getSortDirection: (key: string) => 'asc' | 'desc' | null
  getSortIndex: (key: string) => number | null
  clearSort: () => void
  setSort: (columns: SortColumn[]) => void

  // Combined query params for API
  queryParams: ComputedRef<{
    search?: string
    sort?: string[]
    limit: number
    offset: number
  }>

  // Reset helpers
  resetAll: () => void
  resetPage: () => void
}

/**
 * Parse sort string from URL to SortColumn array
 * e.g., '-createdAt,name' -> [{ key: 'createdAt', direction: 'desc' }, { key: 'name', direction: 'asc' }]
 */
const parseSortString = (sortString: string): SortColumn[] => {
  if (!sortString || sortString.trim() === '') {
    return []
  }

  return sortString.split(',').filter(Boolean).map((s) => {
    const trimmed = s.trim()
    const isDesc = trimmed.startsWith('-')
    return {
      key: isDesc ? trimmed.slice(1) : trimmed,
      direction: (isDesc ? 'desc' : 'asc') as 'asc' | 'desc',
    }
  })
}

/**
 * Convert SortColumn array to URL string
 * e.g., [{ key: 'createdAt', direction: 'desc' }, { key: 'name', direction: 'asc' }] -> '-createdAt,name'
 */
const sortColumnsToString = (columns: SortColumn[]): string => {
  return columns.map(s => s.direction === 'desc' ? `-${s.key}` : s.key).join(',')
}

export const usePagination = (options: UsePaginationOptions = {}): UsePaginationReturn => {
  const {
    defaultPerPage = 10,
    perPageOptions: perPageOpts = [10, 20, 50, 100],
    pageParam = 'page',
    perPageParam = 'perPage',
    searchParam = 'search',
    searchDebounce = 300,
    sortParam = 'sort',
    defaultSort = [],
    maxSortColumns = 3,
    resetOnChange = [],
  } = options

  // === Pagination State ===
  const page = useRouteQuery(pageParam, '1', { transform: Number })
  const perPage = useRouteQuery(perPageParam, String(defaultPerPage), { transform: Number })

  const limit = computed(() => perPage.value)
  const offset = computed(() => (page.value - 1) * perPage.value)

  // === Search State ===
  const search = useRouteQuery(searchParam, '')
  const searchDebounced = refDebounced(search, searchDebounce)

  // === Sort State ===
  const defaultSortString = sortColumnsToString(defaultSort)
  const sortUrlValue = useRouteQuery(sortParam, defaultSortString)

  // Writeable computed for sort state
  const sort = computed({
    get: () => parseSortString(sortUrlValue.value),
    set: (value: SortColumn[]) => {
      sortUrlValue.value = sortColumnsToString(value)
    },
  })

  // API-ready sort format (Directus-style string array)
  const sortApi = computed(() =>
    sort.value.map(s => s.direction === 'desc' ? `-${s.key}` : s.key),
  )

  // === Sort Helpers ===

  /**
   * Handle column header click with shift-click for multi-column sorting
   *
   * Behavior:
   * - Regular click: Replace all sorts with single column (cycles: asc -> desc -> none/default)
   * - Shift+click: Add to existing sorts or toggle direction (cycles: asc -> desc -> remove)
   */
  const handleSort = (key: string, event?: MouseEvent | KeyboardEvent) => {
    const isMultiSort = event?.shiftKey ?? false
    const currentSort = [...sort.value]
    const existingIndex = currentSort.findIndex(s => s.key === key)
    const existingColumn = existingIndex !== -1 ? currentSort[existingIndex] : null

    if (isMultiSort) {
      // Multi-sort mode (Shift+click)
      if (existingColumn) {
        if (existingColumn.direction === 'asc') {
          // asc -> desc
          currentSort[existingIndex] = { key, direction: 'desc' }
        }
        else {
          // desc -> remove
          currentSort.splice(existingIndex, 1)
        }
      }
      else if (currentSort.length < maxSortColumns) {
        // Add new column as asc
        currentSort.push({ key, direction: 'asc' })
      }
      sort.value = currentSort
    }
    else {
      // Single sort mode (regular click)
      if (existingColumn && currentSort.length === 1) {
        if (existingColumn.direction === 'asc') {
          // asc -> desc
          sort.value = [{ key, direction: 'desc' }]
        }
        else {
          // desc -> none (or default)
          sort.value = defaultSort.length > 0 ? [...defaultSort] : []
        }
      }
      else {
        // Replace with single column ascending
        sort.value = [{ key, direction: 'asc' }]
      }
    }
  }

  const getSortDirection = (key: string): 'asc' | 'desc' | null => {
    const column = sort.value.find(s => s.key === key)
    return column?.direction ?? null
  }

  const getSortIndex = (key: string): number | null => {
    const index = sort.value.findIndex(s => s.key === key)
    return index !== -1 ? index + 1 : null
  }

  const clearSort = () => {
    sort.value = []
  }

  const setSort = (columns: SortColumn[]) => {
    sort.value = columns.slice(0, maxSortColumns)
  }

  // === Combined Query Params ===
  const queryParams = computed(() => ({
    ...(searchDebounced.value ? { search: searchDebounced.value } : {}),
    ...(sortApi.value.length > 0 ? { sort: sortApi.value } : {}),
    limit: limit.value,
    offset: offset.value,
  }))

  // === Reset Helpers ===
  const resetPage = () => {
    if (page.value !== 1) {
      page.value = 1
    }
  }

  const resetAll = () => {
    page.value = 1
    perPage.value = defaultPerPage
    search.value = ''
    sort.value = defaultSort.length > 0 ? [...defaultSort] : []
  }

  // === Auto-reset page on filter changes ===
  watch(
    [searchDebounced, () => sortColumnsToString(sort.value)],
    () => {
      resetPage()
    },
  )

  // Watch custom resetOnChange refs
  if (resetOnChange.length > 0) {
    watch(
      resetOnChange,
      () => {
        resetPage()
      },
      { deep: true },
    )
  }

  return {
    // Pagination
    page,
    perPage,
    limit,
    offset,
    perPageOptions: perPageOpts,

    // Search
    search,
    searchDebounced,

    // Sort
    sort,
    sortApi,

    // Sort helpers
    handleSort,
    getSortDirection,
    getSortIndex,
    clearSort,
    setSort,

    // Combined query params
    queryParams,

    // Reset helpers
    resetAll,
    resetPage,
  }
}
