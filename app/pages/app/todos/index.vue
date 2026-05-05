<script setup lang="ts">
/**
 * Todo list page (T-2.5) — `/app/todos`.
 *
 * Renders the workspace's todos under the four canonical views from
 * REQ-TODO-4: Today, Upcoming, Open, Completed. Each view is a query-string
 * swap (`?view=...`) rather than a separate route — the page is a single
 * shell with a tab strip; switching tabs swaps the underlying query but
 * keeps filters and search on the URL.
 *
 * Limitations carried into T-2.6 / T-2.7 / T-2.8:
 *   - "New todo" links to `/app/todos/new` (T-2.6).
 *   - Per-row "Edit" links to `/app/todos/[id]/edit` (T-2.6).
 *   - Subtask rendering lives on the detail page (T-2.7); the flat list
 *     intentionally stays flat. Per-row `n/m` progress badge surfaces here
 *     via `<TodoSubtaskProgress>`, which fans out one small per-row query
 *     into Pinia-Colada.
 *   - KB-link count is still hidden — the list endpoint returns bare rows
 *     and a per-row fetch for that one indicator is not justified here.
 *   - The list endpoint returns no total count; pagination uses page size
 *     plus "is the current page full?" as a heuristic for "has next page"
 *     (same pattern as the KB list).
 *   - Server `tagId` is single-id today, so the tag picker is single-select
 *     even though the brief mentions "multi-select". A multi-select bar
 *     would do client-side OR which is misleading; defer until the API
 *     supports it.
 */
import type { BreadcrumbItem } from '@nuxt/ui'
import type {
  Todo,
  TodoPriority,
  TodoView,
  TodoViewListParams,
  UpcomingTodosListParams,
} from '~/features/todo/types/todo.types'
import { useKbTags } from '~/features/kb/composables/useKbTags'
import TodoSubNav from '~/features/todo/components/TodoSubNav.vue'
import TodoSubtaskProgress from '~/features/todo/components/TodoSubtaskProgress.vue'
import { useTodoCounts } from '~/features/todo/composables/useTodoCounts'
import {
  useCompleteTodo,
  useSoftDeleteTodo,
  useUncompleteTodo,
} from '~/features/todo/composables/useTodoMutations'
import { useTodoView } from '~/features/todo/composables/useTodoView'
import { TODO_PRIORITIES, TODO_VIEWS } from '~/features/todo/types/todo.types'

definePageMeta({
  layout: 'app',
  auth: true,
})

const { t, locale } = useI18n()
const toast = useToast()

useSeoMeta({
  title: () => t('todo.list.title'),
})

// === URL-backed state ===
const VALID_VIEWS = new Set<string>(TODO_VIEWS)
const viewParam = useRouteQuery<string>('view', 'today')
const view = computed<TodoView>({
  get: () => (VALID_VIEWS.has(viewParam.value) ? viewParam.value : 'today') as TodoView,
  set: (value) => {
    viewParam.value = value
  },
})

const search = useRouteQuery<string>('search', '')
const searchDebounced = refDebounced(search, 300)
const priorityParam = useRouteQuery<string>('priority', '')
const tagId = useRouteQuery<string>('tagId', '')

const page = useRouteQuery('page', '1', { transform: Number })
const perPage = 20

// === Filter sources ===
const { tags } = useKbTags({ withUsage: true })

const priorityOptions = computed(() => [
  { value: '', label: t('todo.filters.priority.all') },
  ...TODO_PRIORITIES.map(value => ({ value, label: t(`todo.priority.${value}`) })),
])

const tagOptions = computed(() => [
  { value: '', label: t('todo.filters.tag.all') },
  ...tags.value.map(tag => ({ value: tag.id, label: tag.name })),
])

// === Build per-view query params reactively ===
const queryParams = computed<TodoViewListParams | UpcomingTodosListParams>(() => {
  const base: TodoViewListParams = {
    limit: perPage,
    offset: (page.value - 1) * perPage,
  }
  const s = searchDebounced.value.trim()
  if (s)
    base.search = s
  if (priorityParam.value && (TODO_PRIORITIES as readonly string[]).includes(priorityParam.value))
    base.priority = priorityParam.value as TodoPriority
  if (tagId.value)
    base.tagId = tagId.value
  // Top-level only — subtask UI (T-2.7) renders nested rows under their
  // parents; surfacing every depth in the flat list would double-count.
  base.topLevel = true
  return base
})

const { todos, isLoading, error } = useTodoView(() => ({
  view: view.value,
  params: queryParams.value,
}))

const { counts } = useTodoCounts()

// Reset to page 1 whenever a filter or view changes.
watch(
  [view, searchDebounced, priorityParam, tagId],
  () => {
    if (page.value !== 1)
      page.value = 1
  },
)

// === Pagination heuristic (no total from API) ===
const hasNextPage = computed(() => todos.value.length === perPage)
const hasPrevPage = computed(() => page.value > 1)

// === Mutations ===
const completeMutation = useCompleteTodo()
const uncompleteMutation = useUncompleteTodo()
const softDeleteMutation = useSoftDeleteTodo()

const pendingId = ref<string | null>(null)

const isCompleted = (todo: Todo): boolean => todo.completedAt !== null

const onToggleComplete = async (todo: Todo) => {
  pendingId.value = todo.id
  const wasCompleted = isCompleted(todo)
  try {
    if (wasCompleted)
      await uncompleteMutation.mutateAsync(todo.id)
    else
      await completeMutation.mutateAsync(todo.id)
    toast.add({
      title: wasCompleted
        ? t('todo.actions.uncomplete.toast.success')
        : t('todo.actions.complete.toast.success'),
      color: 'success',
    })
  }
  catch {
    toast.add({
      title: wasCompleted
        ? t('todo.actions.uncomplete.toast.error')
        : t('todo.actions.complete.toast.error'),
      color: 'error',
    })
  }
  finally {
    pendingId.value = null
  }
}

const onDelete = async (todo: Todo) => {
  pendingId.value = todo.id
  try {
    await softDeleteMutation.mutateAsync(todo.id)
    toast.add({
      title: t('todo.actions.delete.toast.success'),
      color: 'success',
    })
  }
  // The mutation surfaces server errors via Pinia-Colada; we just want a
  // toast — same shape as `onToggleComplete` above.
  catch {
    toast.add({
      title: t('todo.actions.delete.toast.error'),
      color: 'error',
    })
  }
  finally {
    pendingId.value = null
  }
}

// === Cell formatters ===
const priorityBadgeColor = (value: TodoPriority) => {
  switch (value) {
    case 'urgent': return 'error' as const
    case 'high': return 'warning' as const
    case 'medium': return 'neutral' as const
    case 'low': return 'info' as const
  }
}

const formatRelative = (iso: string | null): string => {
  if (!iso)
    return ''
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

/**
 * Returns true when a todo has a due date strictly in the past AND is not
 * completed. We render the relative-time label in red for those rows.
 */
const isOverdue = (todo: Todo): boolean => {
  if (!todo.dueAt || isCompleted(todo))
    return false
  const due = new Date(todo.dueAt).getTime()
  if (Number.isNaN(due))
    return false
  // "Past due" = the due date is before now, regardless of date-only vs
  // datetime; matches the server's `due_at::date <= current_date` view rule
  // with a slight client tolerance.
  return due < Date.now()
}

const detailHref = (todo: Todo) => `/app/todos/${encodeURIComponent(todo.id)}/edit`

const resetFilters = () => {
  search.value = ''
  priorityParam.value = ''
  tagId.value = ''
  page.value = 1
}

const hasAnyFilter = computed(() =>
  Boolean(search.value || priorityParam.value || tagId.value),
)

const breadcrumbItems = computed<BreadcrumbItem[]>(() => [
  { label: t('todo.list.title') },
])

// === Per-row kebab menu items ===
const rowMenuItems = (todo: Todo) => [
  [
    {
      label: t('todo.actions.edit'),
      icon: 'i-lucide-pencil',
      to: detailHref(todo),
    },
    {
      label: t('todo.actions.delete.label'),
      icon: 'i-lucide-trash',
      onSelect: () => onDelete(todo),
    },
  ],
]
</script>

<template>
  <UPage>
    <UPageHeader
      :title="t('todo.list.title')"
      :description="t('todo.list.subtitle')"
      :links="[
        { icon: 'i-lucide-plus', label: t('todo.list.create'), to: '/app/todos/new' },
      ]"
      :ui="{ root: 'border-none' }"
    >
      <template #headline>
        <UBreadcrumb :items="breadcrumbItems" />
      </template>
      <div class="mt-4">
        <TodoSubNav v-model="view" :counts="counts" />
      </div>
    </UPageHeader>

    <UPage>
      <div class="space-y-6">
        <!-- Filter bar: search + priority + tag -->
        <div class="space-y-3">
          <UInput
            v-model="search"
            icon="i-lucide-search"
            size="lg"
            :placeholder="t('todo.list.search.placeholder')"
            :aria-label="t('todo.list.search.placeholder')"
            class="w-full"
          />

          <div class="flex flex-wrap items-center gap-2">
            <USelectMenu
              v-model="priorityParam"
              :items="priorityOptions"
              value-key="value"
              label-key="label"
              :placeholder="t('todo.filters.priority.label')"
              icon="i-lucide-flag"
              variant="outline"
              class="min-w-40"
            />

            <USelectMenu
              v-model="tagId"
              :items="tagOptions"
              value-key="value"
              label-key="label"
              :placeholder="t('todo.filters.tag.label')"
              icon="i-lucide-tag"
              variant="outline"
              class="min-w-40"
            />

            <UButton
              v-if="hasAnyFilter"
              variant="ghost"
              color="neutral"
              icon="i-lucide-x"
              size="sm"
              :label="t('todo.filters.reset')"
              @click="resetFilters"
            />
          </div>
        </div>

        <!-- Error -->
        <UAlert
          v-if="error"
          color="error"
          variant="soft"
          :title="t('todo.list.error.title')"
          :description="error.message"
          icon="i-lucide-alert-circle"
        />

        <!-- Loading skeleton -->
        <div v-if="isLoading" class="space-y-3">
          <USkeleton v-for="i in 3" :key="i" class="h-20 w-full" />
        </div>

        <!-- Empty state — copy is per-view -->
        <UCard
          v-else-if="todos.length === 0"
          :ui="{ body: 'flex flex-col items-center text-center py-12 gap-2' }"
        >
          <UIcon name="i-lucide-check-circle-2" class="size-10 text-muted" />
          <h3 class="text-lg font-semibold text-highlighted">
            {{ t(`todo.empty.${view}.title`) }}
          </h3>
          <p class="text-sm text-muted max-w-md">
            {{ t(`todo.empty.${view}.subtitle`) }}
          </p>
        </UCard>

        <!-- Result list -->
        <div v-else class="space-y-2">
          <UCard
            v-for="todo in todos"
            :key="todo.id"
            :ui="{
              root: 'transition-colors hover:bg-accented',
              body: 'p-4',
            }"
          >
            <div class="flex items-start gap-3">
              <!-- Completion checkbox (primary action) -->
              <UCheckbox
                :model-value="isCompleted(todo)"
                :disabled="pendingId === todo.id"
                :aria-label="
                  isCompleted(todo)
                    ? t('todo.actions.uncomplete.label')
                    : t('todo.actions.complete.label')
                "
                class="mt-0.5"
                @update:model-value="onToggleComplete(todo)"
              />

              <div class="min-w-0 flex-1 space-y-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <NuxtLink
                    :to="detailHref(todo)"
                    class="text-base font-semibold text-highlighted truncate hover:underline"
                    :class="{ 'line-through text-muted': isCompleted(todo) }"
                  >
                    {{ todo.title }}
                  </NuxtLink>
                  <UBadge
                    :color="priorityBadgeColor(todo.priority)"
                    variant="subtle"
                    size="xs"
                  >
                    {{ t(`todo.priority.${todo.priority}`) }}
                  </UBadge>
                  <!--
                    Per-row n/m badge (T-2.7). The component fans out one tiny
                    `useTodos({ parentTodoId })` query per visible row; queries
                    with no children render nothing and Pinia-Colada caches the
                    result, so the cost is bounded and amortised across views.
                    Acceptable at our single-user-hub scale; a server-side
                    aggregation in the list endpoint would be the cleaner
                    follow-up if the page size grows.
                  -->
                  <TodoSubtaskProgress :parent-todo-id="todo.id" />
                </div>

                <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <span
                    v-if="todo.dueAt"
                    class="font-mono"
                    :class="isOverdue(todo) ? 'text-error font-medium' : ''"
                  >
                    <UIcon name="i-lucide-calendar" class="size-3.5 align-text-bottom mr-1" />
                    {{ formatRelative(todo.dueAt) }}
                  </span>
                  <span v-if="isCompleted(todo) && todo.completedAt" class="font-mono">
                    <UIcon name="i-lucide-check" class="size-3.5 align-text-bottom mr-1" />
                    {{ formatRelative(todo.completedAt) }}
                  </span>
                </div>
              </div>

              <!-- Kebab menu (edit / delete) -->
              <UDropdownMenu :items="rowMenuItems(todo)">
                <UButton
                  variant="ghost"
                  color="neutral"
                  icon="i-lucide-more-vertical"
                  size="sm"
                  :aria-label="t('todo.actions.menu')"
                  :disabled="pendingId === todo.id"
                />
              </UDropdownMenu>
            </div>
          </UCard>
        </div>

        <!-- Pagination (no total count from API; prev/next only) -->
        <div
          v-if="todos.length > 0 && (hasPrevPage || hasNextPage)"
          class="flex items-center justify-end gap-2"
        >
          <UButton
            variant="outline"
            color="neutral"
            icon="i-lucide-chevron-left"
            :label="t('todo.list.pagination.prev')"
            :disabled="!hasPrevPage"
            @click="page = Math.max(1, page - 1)"
          />
          <span class="text-sm text-muted">
            {{ t('todo.list.pagination.page', { page }) }}
          </span>
          <UButton
            variant="outline"
            color="neutral"
            trailing-icon="i-lucide-chevron-right"
            :label="t('todo.list.pagination.next')"
            :disabled="!hasNextPage"
            @click="page = page + 1"
          />
        </div>
      </div>
    </UPage>
  </UPage>
</template>
