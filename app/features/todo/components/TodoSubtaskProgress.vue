<script setup lang="ts">
/**
 * Inline subtask-progress badge that fetches a parent's direct children and
 * renders `<TodoProgressBadge>` with `completed / total` counts.
 *
 * Used by `TodoSubtaskList` to show `n/m` next to each row in the recursive
 * tree, and by the detail page to show the badge in the subtask header. Both
 * call sites share the same `useTodos({ parentTodoId })` Pinia-Colada query
 * key, so the data fetched here is the same data the recursive list renders
 * — no extra round trip.
 *
 * Renders nothing while loading and nothing when there are zero direct
 * children, so it's safe to drop in anywhere.
 */
import { useTodos } from '../composables/useTodos'
import TodoProgressBadge from './TodoProgressBadge.vue'

const props = defineProps<{
  parentTodoId: string
  size?: 'xs' | 'sm' | 'md'
}>()

const { todos: children, isLoading } = useTodos(() => ({
  parentTodoId: props.parentTodoId,
  includeDeleted: false,
  // Match the sort used by `TodoSubtaskList` so both share the same cache key.
  sort: ['-priority', 'dueAt', '-createdAt'],
  limit: 200,
}))

const total = computed(() => children.value.length)
const completed = computed(() => children.value.filter(t => t.completedAt !== null).length)
</script>

<template>
  <TodoProgressBadge
    v-if="!isLoading && total > 0"
    :total="total"
    :completed="completed"
    :size="size"
  />
</template>
