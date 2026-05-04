<script setup lang="ts" generic="T extends { id: string | number }">
import type { TableColumn, TableRow } from '@nuxt/ui'
import { h } from 'vue'

const props = withDefaults(defineProps<{
  columns: TableColumn<T>[]
  data: T[]
  loading?: boolean
  searchable?: boolean
  searchPlaceholder?: string
  emptyIcon?: string
  emptyText?: string
  pagination?: {
    page: number
    perPage: number
    total: number
  }
  perPageOptions?: number[]
  sortableColumns?: string[]
  getSortDirection?: (key: string) => 'asc' | 'desc' | null
  filterOptions?: { label: string, value: string }[]
  filterPlaceholder?: string
  serverSide?: boolean
}>(), {
  searchable: true,
  searchPlaceholder: 'Search...',
  emptyIcon: 'i-lucide-inbox',
  emptyText: 'No items found',
  perPageOptions: () => [10, 25, 50, 100],
  sortableColumns: () => [],
  filterPlaceholder: 'Filter',
})

const emit = defineEmits<{
  'select': [item: T]
  'update:search': [value: string]
  'update:page': [page: number]
  'update:perPage': [perPage: number]
  'sort': [key: string, event: MouseEvent | KeyboardEvent]
}>()

// Type-safe slots are documented but not enforced for dynamic column slots
// Column slots follow the pattern: {columnKey}-cell, {columnKey}-header

const runtimeSlots = useSlots()

const search = defineModel<string>('search', { default: '' })
const filter = defineModel<string>('filter')

const debouncedSearch = refDebounced(search, 300)

// Filter menu items for mobile AppResponsiveMenu
const filterMenuItems = computed(() => {
  if (!props.filterOptions?.length)
    return []
  return [props.filterOptions.map(opt => ({
    label: opt.label,
    icon: filter.value === opt.value ? 'i-lucide-check' : undefined,
    click: () => { filter.value = opt.value },
  }))]
})

watch(debouncedSearch, (value) => {
  emit('update:search', value)
})

const filteredData = computed(() => {
  if (props.serverSide)
    return props.data
  if (!search.value.trim() || !props.searchable) {
    return props.data
  }
  const query = search.value.toLowerCase()
  return props.data.filter((item) => {
    // Search through all string values in the item
    return Object.values(item).some((value) => {
      if (typeof value === 'string') {
        return value.toLowerCase().includes(query)
      }
      if (typeof value === 'object' && value !== null) {
        // Search nested objects (e.g., user.email)
        return Object.values(value).some(
          nestedValue => typeof nestedValue === 'string' && nestedValue.toLowerCase().includes(query),
        )
      }
      return false
    })
  })
})

const onTableSelect = (_e: Event, row: TableRow<T>) => {
  emit('select', row.original)
}

const onMobileSelect = (item: T) => {
  emit('select', item)
}

const currentPage = computed(() => props.pagination?.page ?? 1)
const totalPages = computed(() => {
  if (!props.pagination)
    return 1
  return Math.ceil(props.pagination.total / props.pagination.perPage)
})
const hasNextPage = computed(() => currentPage.value < totalPages.value)
const hasPrevPage = computed(() => currentPage.value > 1)

const goToPage = (page: number) => {
  emit('update:page', page)
}

// Per page dropdown options
const perPageSelectOptions = computed(() =>
  props.perPageOptions.map(n => ({ label: String(n), value: n })),
)

const onPerPageChange = (value: number) => {
  emit('update:perPage', value)
  emit('update:page', 1) // Reset to first page when changing perPage
}

// Range info (e.g., "1-10 of 100")
const rangeStart = computed(() => {
  if (!props.pagination || props.pagination.total === 0)
    return 0
  return (currentPage.value - 1) * props.pagination.perPage + 1
})

const rangeEnd = computed(() => {
  if (!props.pagination)
    return 0
  return Math.min(currentPage.value * props.pagination.perPage, props.pagination.total)
})

// Collect dynamic slots to pass through to UTable
const columnSlots = computed(() => {
  return Object.keys(runtimeSlots).filter(
    name => name.endsWith('-cell') || name.endsWith('-header'),
  )
})

// Check if a column is sortable
const isColumnSortable = (columnKey: string) => {
  return props.sortableColumns.includes(columnKey)
}

// Handle sort click
const onSortClick = (columnKey: string, event: MouseEvent) => {
  emit('sort', columnKey, event)
}

// Transform columns to add sortable headers using render functions
const columnsWithSort = computed(() => {
  return props.columns.map((col) => {
    // @ts-expect-error accessorKey is string | string[]
    const key = col.accessorKey as string
    if (!key || !isColumnSortable(key))
      return col

    const originalHeader = col.header

    // Return column with render function for sortable header
    return {
      ...col,
      header: () => {
        const direction = props.getSortDirection?.(key)
        const icon = direction === 'asc'
          ? 'i-lucide-arrow-up-narrow-wide'
          : direction === 'desc'
            ? 'i-lucide-arrow-down-wide-narrow'
            : 'i-lucide-arrow-up-down'

        return h(
          'button',
          {
            type: 'button',
            class: 'flex items-center gap-1 -mx-2 px-2 py-1 rounded hover:bg-elevated transition-colors',
            onClick: (event: MouseEvent) => onSortClick(key, event),
          },
          [
            h('span', {}, typeof originalHeader === 'string' ? originalHeader : key),
            h(resolveComponent('UIcon'), {
              name: icon,
              class: ['size-4', direction ? 'text-highlighted' : 'text-muted'],
            }),
          ],
        )
      },
    }
  }) as TableColumn<T>[]
})
</script>

<template>
  <UPageCard
    variant="subtle"
    :ui="{
      root: 'overflow-x-auto',
      container: 'p-0 sm:p-0 gap-y-0 min-w-0 lg:flex lg:flex-col',
      wrapper: 'items-stretch min-w-0 flex-none',
      header: (searchable || filterOptions?.length || $slots['header-extra']) ? 'p-4 mb-0 border-b border-default' : '',
    }"
  >
    <!-- Header with search and filter -->
    <template v-if="searchable || filterOptions?.length || $slots['header-extra']" #header>
      <div class="flex items-center gap-3">
        <UInput
          v-if="searchable"
          v-model="search"
          icon="i-lucide-search"
          :placeholder="searchPlaceholder"
          class="flex-1"
        />
        <!-- Filter: Desktop USelect, Mobile AppResponsiveMenu -->
        <template v-if="filterOptions?.length">
          <USelect
            v-model="filter"
            :items="filterOptions"
            :placeholder="filterPlaceholder"
            class="hidden sm:block w-32"
          />
          <AppResponsiveMenu
            :items="filterMenuItems"
            title="Filter"
            class="sm:hidden"
          >
            <UButton icon="i-lucide-filter" variant="outline" size="sm" />
          </AppResponsiveMenu>
        </template>
        <slot name="header-extra" />
      </div>
    </template>

    <!-- Desktop: UTable -->
    <div class="hidden md:block min-w-0">
      <UTable
        :columns="columnsWithSort"
        :data="filteredData"
        :loading="loading"
        :ui="{
          tr: 'hover:bg-elevated transition-colors cursor-pointer',
        }"
        @select="onTableSelect"
      >
        <!-- Pass through all column slots dynamically -->
        <template v-for="slotName in columnSlots" :key="slotName" #[slotName]="slotProps">
          <slot :name="slotName" v-bind="slotProps" />
        </template>

        <template #empty>
          <div class="py-12 text-center text-muted">
            <UIcon :name="emptyIcon" class="size-8 mx-auto mb-2 opacity-50" />
            <p v-if="search">
              No results for "{{ search }}"
            </p>
            <p v-else>
              {{ emptyText }}
            </p>
          </div>
        </template>
      </UTable>

      <!-- Desktop pagination -->
      <div v-if="pagination" class="flex items-center justify-between p-4 border-t border-default">
        <div class="flex items-center gap-3">
          <USelect
            :model-value="pagination.perPage"
            :items="perPageSelectOptions"
            class="w-20"
            @update:model-value="onPerPageChange"
          />
          <span class="text-sm text-muted">
            {{ rangeStart }}-{{ rangeEnd }} of {{ pagination.total }}
          </span>
        </div>
        <UPagination
          v-if="totalPages > 1"
          :default-page="currentPage"
          :total="pagination.total"
          :items-per-page="pagination.perPage"
          :sibling-count="1"
          :show-edges="false"
          @update:page="goToPage"
        />
      </div>
    </div>

    <!-- Mobile: Card list -->
    <div class="block md:hidden">
      <!-- Loading state -->
      <div v-if="loading" class="py-12 text-center text-muted">
        <UIcon name="i-lucide-loader-2" class="size-6 mx-auto animate-spin" />
        <p class="mt-2">
          Loading...
        </p>
      </div>

      <!-- Empty state -->
      <div v-else-if="filteredData.length === 0" class="py-12 text-center text-muted">
        <UIcon :name="emptyIcon" class="size-8 mx-auto mb-2 opacity-50" />
        <p v-if="search">
          No results for "{{ search }}"
        </p>
        <p v-else>
          {{ emptyText }}
        </p>
      </div>

      <!-- Card list -->
      <ul v-else role="list" class="divide-y divide-default">
        <li
          v-for="item in filteredData"
          :key="item.id"
          class="hover:bg-elevated transition-colors cursor-pointer"
          @click="onMobileSelect(item)"
        >
          <slot name="mobile-card" :item="item" />
        </li>
      </ul>

      <!-- Mobile pagination: simplified prev/next -->
      <div
        v-if="pagination && totalPages > 1"
        class="flex items-center justify-between p-4 border-t border-default"
      >
        <UButton
          :disabled="!hasPrevPage"
          variant="outline"
          icon="i-lucide-chevron-left"
          aria-label="Previous page"
          @click="goToPage(currentPage - 1)"
        />
        <span class="text-sm text-muted">
          {{ currentPage }} / {{ totalPages }}
        </span>
        <UButton
          :disabled="!hasNextPage"
          variant="outline"
          icon="i-lucide-chevron-right"
          aria-label="Next page"
          @click="goToPage(currentPage + 1)"
        />
      </div>
    </div>
  </UPageCard>
</template>
