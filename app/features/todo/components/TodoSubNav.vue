<script setup lang="ts">
/**
 * Todo sub-navigation (T-2.5).
 *
 * Horizontal tab strip with the four canonical views (REQ-TODO-4). Mirrors
 * `KbSubNav` visually, but each tab is a `?view=...` query swap rather than
 * a route change — the four views are siblings of the same list page, not
 * separate pages.
 *
 * Each tab shows a small count badge sourced from `useTodoCounts`. Counts
 * are best-effort (cached); completion / restore / delete mutations bust
 * the counts query explicitly via `useTodoMutations.invalidateTodo`.
 */
import type { TodoCounts, TodoView } from '~/features/todo/types/todo.types'
import { TODO_VIEWS } from '~/features/todo/types/todo.types'

interface Props {
  /** Currently active view (driven by the URL `?view=` param on the page). */
  modelValue: TodoView
  /** Pre-loaded counts for the badges. */
  counts: TodoCounts
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: TodoView]
}>()

const { t } = useI18n()

const onSelect = (view: TodoView) => {
  if (view !== props.modelValue)
    emit('update:modelValue', view)
}

const items = computed(() => TODO_VIEWS.map(view => ({
  label: t(`todo.subnav.${view}`),
  active: view === props.modelValue,
  badge: props.counts[view] > 0
    ? { label: String(props.counts[view]), variant: 'subtle' as const, color: 'neutral' as const }
    : undefined,
  onSelect: () => onSelect(view),
})))
</script>

<template>
  <UNavigationMenu
    :items="items"
    orientation="horizontal"
    highlight
    aria-label="Todo sub-navigation"
  />
</template>
