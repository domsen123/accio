<script setup lang="ts">
import type { BreadcrumbItem } from '@nuxt/ui'
import type { KbEntriesListParams, KbEntry, KbEntryAuthorType, KbEntrySourceType, KbEntryStatus } from '~/features/kb/types/kb.types'
import KbCategoryTree from '~/features/kb/components/KbCategoryTree.vue'
import KbSubNav from '~/features/kb/components/KbSubNav.vue'
import { KB_ENTRY_AUTHOR_TYPES, KB_ENTRY_SOURCE_TYPES, KB_ENTRY_STATUSES } from '~/features/kb/types/kb.types'

const isStatus = (v: string): v is KbEntryStatus =>
  (KB_ENTRY_STATUSES as readonly string[]).includes(v)
const isAuthorType = (v: string): v is KbEntryAuthorType =>
  (KB_ENTRY_AUTHOR_TYPES as readonly string[]).includes(v)
const isSourceType = (v: string): v is KbEntrySourceType =>
  (KB_ENTRY_SOURCE_TYPES as readonly string[]).includes(v)

definePageMeta({
  layout: 'app',
  auth: true,
})

const { t, locale } = useI18n()

useSeoMeta({
  title: () => t('kb.list.title'),
})

// === URL-backed filter + pagination state ===
const search = useRouteQuery<string>('search', '')
const searchDebounced = refDebounced(search, 300)

// Status: comma-separated in the URL ("inbox,draft"). When unset, server
// default applies (all except archived). Empty string → "all (default)".
const statusParam = useRouteQuery<string>('status', '')
const status = computed<KbEntryStatus[]>({
  get: () => statusParam.value
    ? statusParam.value.split(',').filter(isStatus)
    : [],
  set: (value) => {
    statusParam.value = value.join(',')
  },
})

const categoryId = useRouteQuery<string>('categoryId', '')
const tagId = useRouteQuery<string>('tagId', '')
const authorType = useRouteQuery<string>('authorType', '')
const sourceType = useRouteQuery<string>('sourceType', '')

const page = useRouteQuery('page', '1', { transform: Number })
const perPage = 20

// === Composables for filter sources ===
const { categories } = useKbCategories()
const { tags } = useKbTags({ withUsage: true })

// === Status options (with i18n labels) ===
const statusOptions = computed(() =>
  (['inbox', 'draft', 'verified', 'archived'] as const).map(value => ({
    value,
    label: t(`kb.status.${value}`),
  })),
)

const categoryOptions = computed(() => [
  { value: '', label: t('kb.filters.category.all') },
  ...categories.value.map(c => ({ value: c.id, label: c.name })),
])

const tagOptions = computed(() => [
  { value: '', label: t('kb.filters.tag.all') },
  ...tags.value.map(tag => ({ value: tag.id, label: tag.name })),
])

const authorOptions = computed(() => [
  { value: '', label: t('kb.filters.author.all') },
  { value: 'human', label: t('kb.author.human') },
  { value: 'ai', label: t('kb.author.ai') },
])

const sourceOptions = computed(() => [
  { value: '', label: t('kb.filters.source.all') },
  { value: 'manual', label: t('kb.source.manual') },
  { value: 'commit', label: t('kb.source.commit') },
  { value: 'claude_code_session', label: t('kb.source.claude_code_session') },
  { value: 'chat', label: t('kb.source.chat') },
  { value: 'external', label: t('kb.source.external') },
])

// === Build the query params object reactively for the entries query ===
const queryParams = computed<KbEntriesListParams>(() => {
  const params: KbEntriesListParams = {
    limit: perPage,
    offset: (page.value - 1) * perPage,
  }
  const s = searchDebounced.value.trim()
  if (s)
    params.search = s
  if (status.value.length > 0)
    params.status = status.value
  if (categoryId.value) {
    params.categoryId = categoryId.value
    // T-1.11: when filtering by category we always include descendants so the
    // tree's parent-row click shows entries from the entire subtree
    // (REQ-KB-3). The dropdown filter behaves the same way for consistency.
    params.includeDescendantCategories = true
  }
  if (tagId.value)
    params.tagId = tagId.value
  if (authorType.value && isAuthorType(authorType.value))
    params.authorType = authorType.value
  if (sourceType.value && isSourceType(sourceType.value))
    params.sourceType = sourceType.value
  return params
})

const { entries, isLoading, error } = useKbEntries(queryParams)

// Reset to page 1 whenever a filter changes so we don't show "page 5" of a
// new query.
watch(
  [searchDebounced, status, categoryId, tagId, authorType, sourceType],
  () => {
    if (page.value !== 1)
      page.value = 1
  },
  { deep: true },
)

// === Pagination heuristic (no total from API) ===
const hasNextPage = computed(() => entries.value.length === perPage)
const hasPrevPage = computed(() => page.value > 1)

// === Cell formatters ===
const statusBadgeColor = (value: KbEntryStatus) => {
  switch (value) {
    case 'inbox': return 'info' as const
    case 'draft': return 'warning' as const
    case 'verified': return 'success' as const
    case 'archived': return 'neutral' as const
  }
}

const statusBadgeVariant = (value: KbEntryStatus) =>
  value === 'archived' ? ('outline' as const) : ('subtle' as const)

// Lightweight relative-time formatter via Intl.RelativeTimeFormat — avoids
// pulling in date-fns just for one cell. Acceptable interim until a shared
// helper is needed elsewhere.
const formatRelative = (iso: string): string => {
  const target = new Date(iso).getTime()
  if (Number.isNaN(target))
    return ''
  const diffMs = target - Date.now()
  const diffSec = Math.round(diffMs / 1000)
  const rtf = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' })
  const abs = Math.abs(diffSec)
  if (abs < 60)
    return rtf.format(diffSec, 'second')
  if (abs < 3600)
    return rtf.format(Math.round(diffSec / 60), 'minute')
  if (abs < 86_400)
    return rtf.format(Math.round(diffSec / 3600), 'hour')
  if (abs < 2_592_000)
    return rtf.format(Math.round(diffSec / 86_400), 'day')
  if (abs < 31_104_000)
    return rtf.format(Math.round(diffSec / 2_592_000), 'month')
  return rtf.format(Math.round(diffSec / 31_104_000), 'year')
}

const resetFilters = () => {
  search.value = ''
  statusParam.value = ''
  categoryId.value = ''
  tagId.value = ''
  authorType.value = ''
  sourceType.value = ''
  page.value = 1
}

const hasAnyFilter = computed(() =>
  Boolean(
    search.value
    || status.value.length
    || categoryId.value
    || tagId.value
    || authorType.value
    || sourceType.value,
  ),
)

const detailHref = (entry: KbEntry) => `/app/kb/${encodeURIComponent(entry.slug)}`

const breadcrumbItems = computed<BreadcrumbItem[]>(() => [
  { label: t('kb.list.title') },
])
</script>

<template>
  <UPage>
    <UPageHeader
      :title="t('kb.list.title')"
      :description="t('kb.list.subtitle')"
      :links="[
        { icon: 'i-lucide-plus', label: t('kb.list.create'), to: '/app/kb/new', color: 'primary', variant: 'solid' },
      ]"
      :ui="{
        root: 'border-none',
      }"
    >
      <template #headline>
        <UBreadcrumb :items="breadcrumbItems" />
      </template>
      <div class="mt-4">
        <KbSubNav />
      </div>
    </UPageHeader>

    <UPage>
      <template #left>
        <div class="rounded-lg border border-default bg-elevated p-4">
          <KbCategoryTree
            :categories="categories"
            :selected-id="categoryId"
            @select="(id) => (categoryId = id)"
          />
        </div>
      </template>

      <div class="space-y-6">
        <!-- Filter bar: search + chips/dropdowns -->
        <div class="space-y-3 rounded-lg border border-default bg-elevated p-4">
          <UInput
            v-model="search"
            icon="i-lucide-search"
            variant="outline"
            :placeholder="t('kb.list.search.placeholder')"
            :aria-label="t('kb.list.search.placeholder')"
            class="w-full"
          />

          <div class="flex flex-wrap items-center gap-2 lg:flex-nowrap lg:gap-3">
            <USelectMenu
              v-model="status"
              multiple
              :items="statusOptions"
              value-key="value"
              label-key="label"
              :placeholder="t('kb.filters.status.label')"
              icon="i-lucide-circle-dot"
              variant="ghost"
              class="min-w-40 flex-1"
            />

            <!-- Mobile/tablet category dropdown: hidden on lg+ where the -->
            <!-- tree handles category selection. -->
            <USelectMenu
              v-model="categoryId"
              :items="categoryOptions"
              value-key="value"
              label-key="label"
              :placeholder="t('kb.filters.category.label')"
              icon="i-lucide-folder"
              variant="ghost"
              class="min-w-40 lg:hidden"
            />

            <USelectMenu
              v-model="tagId"
              :items="tagOptions"
              value-key="value"
              label-key="label"
              :placeholder="t('kb.filters.tag.label')"
              icon="i-lucide-tag"
              variant="ghost"
              class="min-w-40 flex-1"
            />

            <USelectMenu
              v-model="authorType"
              :items="authorOptions"
              value-key="value"
              label-key="label"
              :placeholder="t('kb.filters.author.label')"
              icon="i-lucide-user"
              variant="ghost"
              class="min-w-32 flex-1"
            />

            <USelectMenu
              v-model="sourceType"
              :items="sourceOptions"
              value-key="value"
              label-key="label"
              :placeholder="t('kb.filters.source.label')"
              icon="i-lucide-link"
              variant="ghost"
              class="min-w-40 flex-1"
            />

            <UButton
              v-if="hasAnyFilter"
              variant="ghost"
              color="neutral"
              icon="i-lucide-x"
              size="sm"
              :label="t('kb.filters.reset')"
              class="shrink-0"
              @click="resetFilters"
            />
          </div>
        </div>

        <!-- Error -->
        <UAlert
          v-if="error"
          color="error"
          variant="soft"
          :title="t('kb.list.error.title')"
          :description="error.message"
          icon="i-lucide-alert-circle"
        />

        <!-- Loading skeleton -->
        <div v-if="isLoading" class="space-y-3">
          <USkeleton v-for="i in 3" :key="i" class="h-20 w-full" />
        </div>

        <!-- Empty state -->
        <UCard
          v-else-if="entries.length === 0"
          :ui="{ body: 'flex flex-col items-center text-center py-12 gap-2' }"
        >
          <UIcon name="i-lucide-book-open" class="size-10 text-muted" />
          <h3 class="text-xl font-semibold text-highlighted">
            {{ t('kb.empty.title') }}
          </h3>
          <p class="text-sm text-muted max-w-md">
            {{ t('kb.empty.subtitle') }}
          </p>
        </UCard>

        <!-- Result list (cards). Cards read better at this density than a -->
        <!-- multi-column table given variable-length tag/category metadata. -->
        <ul v-else class="space-y-3">
          <li v-for="entry in entries" :key="entry.id">
            <NuxtLink :to="detailHref(entry)" class="block group">
              <UCard
                :ui="{
                  root: 'bg-elevated transition-colors hover:bg-accented',
                  body: 'p-4',
                }"
              >
                <div class="flex items-stretch gap-4">
                  <div class="min-w-0 flex-1 space-y-2">
                    <!-- Title row -->
                    <div class="flex items-center gap-3 flex-wrap">
                      <h3 class="text-xl font-semibold text-highlighted truncate">
                        {{ entry.title }}
                      </h3>
                      <UBadge
                        :color="statusBadgeColor(entry.status)"
                        :variant="statusBadgeVariant(entry.status)"
                        size="sm"
                      >
                        {{ t(`kb.status.${entry.status}`) }}
                      </UBadge>
                      <UIcon
                        v-if="entry.authorType === 'ai'"
                        name="i-lucide-sparkles"
                        class="size-4 text-primary"
                        :aria-label="t('kb.author.ai')"
                      />
                    </div>

                    <!-- Slug -->
                    <p class="text-sm font-mono text-muted truncate">
                      {{ entry.slug }}
                    </p>

                    <!-- Category + tags -->
                    <div
                      v-if="entry.category || (entry.tags && entry.tags.length)"
                      class="flex flex-wrap items-center gap-1"
                    >
                      <UBadge
                        v-if="entry.category"
                        variant="outline"
                        size="xs"
                        icon="i-lucide-folder"
                      >
                        {{ entry.category.name }}
                      </UBadge>
                      <UBadge
                        v-for="tag in entry.tags"
                        :key="tag.id"
                        variant="subtle"
                        color="neutral"
                        size="xs"
                      >
                        {{ tag.name }}
                      </UBadge>
                    </div>

                    <!-- Meta row -->
                    <div class="flex items-center gap-4 text-xs text-muted">
                      <div v-if="entry.authorName" class="flex items-center gap-1.5">
                        <UIcon name="i-lucide-user" class="size-4" />
                        <span class="truncate max-w-32">{{ entry.authorName }}</span>
                      </div>
                      <div class="flex items-center gap-1.5">
                        <UIcon name="i-lucide-clock" class="size-4" />
                        <span class="font-mono">{{ t('kb.list.updatedRelative', { time: formatRelative(entry.updatedAt) }) }}</span>
                      </div>
                    </div>
                  </div>

                  <!-- Trailing arrow -->
                  <div class="shrink-0 flex items-end">
                    <UIcon
                      name="i-lucide-arrow-right"
                      class="size-5 text-muted group-hover:text-default transition-colors"
                    />
                  </div>
                </div>
              </UCard>
            </NuxtLink>
          </li>
        </ul>

        <!-- Pagination (no total count from API; prev/next only) -->
        <div
          v-if="entries.length > 0 && (hasPrevPage || hasNextPage)"
          class="flex items-center justify-end gap-2"
        >
          <UButton
            variant="outline"
            color="neutral"
            icon="i-lucide-chevron-left"
            :label="t('kb.list.pagination.prev')"
            :disabled="!hasPrevPage"
            @click="page = Math.max(1, page - 1)"
          />
          <span class="text-sm text-muted font-mono">
            {{ t('kb.list.pagination.page', { page }) }}
          </span>
          <UButton
            variant="outline"
            color="neutral"
            trailing-icon="i-lucide-chevron-right"
            :label="t('kb.list.pagination.next')"
            :disabled="!hasNextPage"
            @click="page = page + 1"
          />
        </div>
      </div>
    </UPage>
  </UPage>
</template>
