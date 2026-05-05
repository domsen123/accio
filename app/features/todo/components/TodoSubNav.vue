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

const tabs = computed(() => TODO_VIEWS.map(view => ({
  key: view,
  label: t(`todo.subnav.${view}`),
  count: props.counts[view],
})))

const onSelect = (view: TodoView) => {
  if (view !== props.modelValue)
    emit('update:modelValue', view)
}
</script>

<template>
  <div class="border-b border-default">
    <nav class="flex items-center gap-1 -mb-px" aria-label="Todo sub-navigation">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        type="button"
        class="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 transition-colors"
        :class="
          tab.key === modelValue
            ? 'border-primary text-primary'
            : 'border-transparent text-muted hover:text-default hover:border-muted'
        "
        @click="onSelect(tab.key)"
      >
        <span>{{ tab.label }}</span>
        <UBadge
          v-if="tab.count > 0"
          :color="tab.key === modelValue ? 'primary' : 'neutral'"
          variant="subtle"
          size="xs"
        >
          {{ tab.count }}
        </UBadge>
      </button>
    </nav>
  </div>
</template>
