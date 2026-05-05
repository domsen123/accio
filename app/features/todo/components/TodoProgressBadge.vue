<script setup lang="ts">
/**
 * Subtask progress badge — `n/m` (T-2.7).
 *
 * Shows "completed direct children / total direct children" next to a todo
 * row that has subtasks. We deliberately count **direct** children only
 * (REQ-TODO-2 says nothing about descendants, and the typical UX for nested
 * lists is per-level). If a future task wants whole-subtree progress the
 * badge accepts pre-computed `total` / `completed` numbers, so swapping the
 * caller is the only change required.
 *
 * Visual: a tiny `UBadge` shaped like `{completed}/{total}` with a checklist
 * icon. The badge turns success-coloured once everything is done so a parent
 * with `5/5` reads as "fully knocked out".
 */
withDefaults(defineProps<{
  total: number
  completed: number
  /**
   * Optional size override — defaults to `xs` so the badge fits inline next
   * to a list-row title without crowding the priority chip.
   */
  size?: 'xs' | 'sm' | 'md'
}>(), {
  size: 'xs',
})

const { t } = useI18n()
</script>

<template>
  <UBadge
    :color="completed > 0 && completed === total ? 'success' : 'neutral'"
    variant="subtle"
    :size="size"
    :aria-label="t('todo.subtask.progress.aria', { completed, total })"
  >
    <UIcon name="i-lucide-list-checks" class="size-3 mr-1" />
    {{ completed }}/{{ total }}
  </UBadge>
</template>
