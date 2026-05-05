<script setup lang="ts">
/**
 * Recursive subtask list (T-2.7, REQ-TODO-2).
 *
 * Renders the direct children of a `parentTodoId` as a vertical stack of
 * compact rows, then recursively mounts itself for each child whose subtree
 * still fits inside `TODO_MAX_DEPTH`. The component is intentionally simple:
 *
 *   - One `useTodos({ parentTodoId, includeDeleted: false })` query per
 *     mounted instance. With `TODO_MAX_DEPTH = 3` and an eager render,
 *     a fully-populated subtree triggers **at most 1 + n + n*m round
 *     trips**, where `n` and `m` are the per-level branching factor. At
 *     our scale (single-user hub, hand-curated todo trees) this is well
 *     inside the budget — option (a) from the task brief.
 *
 *   - Each row exposes a completion checkbox, the title (linking into
 *     `/app/todos/<id>`), a priority badge, the relative due date when
 *     present, and an `n/m` progress badge once we know its direct
 *     children. At depth `< TODO_MAX_DEPTH` the row also surfaces a
 *     "+ Subtask" link that navigates to `/app/todos/new?parentId=<id>`
 *     (the existing form picks the parent up from the query).
 *
 *   - The depth gate is purely UX. The server-side check
 *     ({@link TodoSubtaskDepthExceededError}) remains the authority — if
 *     the user URL-bypasses the gate the create POST still rejects.
 *
 * `n/m` progress = direct children only. REQ-TODO-2 doesn't mandate whole-
 * subtree progress and per-level is the typical UX for nested checklists.
 *
 * Visual nesting: each level adds `depth * 16px` of left padding so the
 * tree reads as a tree without having to draw connecting lines.
 */
import type { Todo, TodoPriority } from '../types/todo.types'
import { useCompleteTodo, useUncompleteTodo } from '../composables/useTodoMutations'
import { useTodos } from '../composables/useTodos'
import TodoSubtaskProgress from './TodoSubtaskProgress.vue'

const props = withDefaults(defineProps<{
  parentTodoId: string
  /**
   * 1-based depth of the children rendered by *this* instance. The root
   * parent is conceptually depth 0; its direct children — which this
   * component renders when first instantiated — are depth 1, grandchildren
   * depth 2, great-grandchildren depth 3 (the deepest level allowed by
   * REQ-TODO-2).
   */
  depth: number
  /**
   * When true, render nothing (not even the "no subtasks" message) if
   * `parentTodoId` has zero children. The detail page wants the message at
   * the root; recursive instances inside the tree do not, since most
   * leaves are leaves and the message would create visual noise.
   */
  hideEmptyState?: boolean
}>(), {
  hideEmptyState: false,
})

/** Maximum subtask depth — mirrors `TODO_MAX_DEPTH` in the server types. */
const TODO_MAX_DEPTH = 3

const { t, locale } = useI18n()
const toast = useToast()

const { todos: children, isLoading, error } = useTodos(() => ({
  parentTodoId: props.parentTodoId,
  includeDeleted: false,
  // Sort the same way `listOpen` does — priority desc, then due asc nulls last,
  // then created desc — so the visual order matches "do this first" intent.
  sort: ['-priority', 'dueAt', '-createdAt'],
  // Generous limit — depth-capped at 3 with a single-user hub, the per-level
  // fan-out is small in practice. Pagination on subtask lists would be more
  // confusing than helpful.
  limit: 200,
}))

const indentStyle = computed(() => ({
  // depth is 1-based for the root subtasks; depth 1 needs no extra indent
  // since the section already has its own padding.
  paddingLeft: `${(props.depth - 1) * 16}px`,
}))

const isCompleted = (todo: Todo): boolean => todo.completedAt !== null

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

const isOverdue = (todo: Todo): boolean => {
  if (!todo.dueAt || isCompleted(todo))
    return false
  const due = new Date(todo.dueAt).getTime()
  if (Number.isNaN(due))
    return false
  return due < Date.now()
}

const completeMutation = useCompleteTodo()
const uncompleteMutation = useUncompleteTodo()
const pendingId = ref<string | null>(null)

const onToggleComplete = async (todo: Todo) => {
  pendingId.value = todo.id
  const wasCompleted = isCompleted(todo)
  try {
    if (wasCompleted)
      await uncompleteMutation.mutateAsync(todo.id)
    else
      await completeMutation.mutateAsync(todo.id)
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

const canAddDeeper = computed(() => props.depth < TODO_MAX_DEPTH)

const subtaskHrefFor = (childId: string) =>
  `/app/todos/new?parentId=${encodeURIComponent(childId)}`
</script>

<template>
  <div class="space-y-1.5" :style="indentStyle">
    <UAlert
      v-if="error"
      color="error"
      variant="soft"
      icon="i-lucide-alert-circle"
      :title="t('todo.subtask.error')"
      :description="error.message"
    />

    <div v-else-if="isLoading" class="space-y-1.5">
      <USkeleton class="h-9 w-full" />
      <USkeleton class="h-9 w-full" />
    </div>

    <p
      v-else-if="children.length === 0 && !hideEmptyState"
      class="text-xs text-muted italic px-1 py-1.5"
    >
      {{ t('todo.subtask.empty') }}
    </p>

    <template v-else>
      <div
        v-for="child in children"
        :key="child.id"
        class="space-y-1.5"
      >
        <div
          class="flex items-start gap-2 py-1.5 px-2 rounded-md transition-colors hover:bg-elevated/60 border-l-2 border-default"
        >
          <UCheckbox
            :model-value="isCompleted(child)"
            :disabled="pendingId === child.id"
            :aria-label="
              isCompleted(child)
                ? t('todo.actions.uncomplete.label')
                : t('todo.actions.complete.label')
            "
            class="mt-0.5"
            @update:model-value="onToggleComplete(child)"
          />

          <div class="min-w-0 flex-1 space-y-0.5">
            <div class="flex items-center gap-2 flex-wrap">
              <NuxtLink
                :to="`/app/todos/${encodeURIComponent(child.id)}`"
                class="text-sm font-medium text-highlighted truncate hover:underline"
                :class="{ 'line-through text-muted': isCompleted(child) }"
              >
                {{ child.title }}
              </NuxtLink>
              <UBadge
                :color="priorityBadgeColor(child.priority)"
                variant="subtle"
                size="xs"
              >
                {{ t(`todo.priority.${child.priority}`) }}
              </UBadge>
              <span
                v-if="child.dueAt"
                class="text-xs"
                :class="isOverdue(child) ? 'text-error font-medium' : 'text-muted'"
              >
                <UIcon name="i-lucide-calendar" class="size-3 align-text-bottom mr-0.5" />
                {{ formatRelative(child.dueAt) }}
              </span>
              <!--
                `n/m` reflects the child's own direct subtasks (one level
                deeper). Children at depth === TODO_MAX_DEPTH cannot have
                grandchildren per REQ-TODO-2, so the badge would always
                render `0/0` and is hidden there.

                The fetch here shares its Pinia-Colada cache key with the
                recursive `<TodoSubtaskList>` rendered just below, so this
                does not add an extra round trip.
              -->
              <TodoSubtaskProgress
                v-if="depth < TODO_MAX_DEPTH"
                :parent-todo-id="child.id"
              />
            </div>
          </div>

          <UButton
            v-if="canAddDeeper"
            variant="ghost"
            color="neutral"
            size="xs"
            icon="i-lucide-plus"
            :label="t('todo.subtask.add')"
            :to="subtaskHrefFor(child.id)"
          />
        </div>

        <!--
          Recurse into the next depth. We stop at TODO_MAX_DEPTH (rendered
          children at depth === TODO_MAX_DEPTH cannot themselves have
          subtasks per REQ-TODO-2). The recursive instance loads its own
          children — see the file header for the round-trip budget.
        -->
        <TodoSubtaskList
          v-if="depth < TODO_MAX_DEPTH"
          :parent-todo-id="child.id"
          :depth="depth + 1"
          hide-empty-state
        />
      </div>
    </template>
  </div>
</template>
