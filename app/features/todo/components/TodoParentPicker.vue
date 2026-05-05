<script setup lang="ts">
/**
 * Single-select parent-todo picker for the Todo form (T-2.6).
 *
 * Backed by `UInputMenu`'s `v-model:search-term` so the user types a query
 * and we feed the dropdown items from `GET /api/todos?search=...&limit=10`.
 * The query is debounced (200ms) so we don't hammer the API on every key.
 *
 * Self-selection is filtered out client-side (`excludeId`); server-side
 * descendant rejection is the source of truth — the form surfaces a toast
 * if the server rejects the selected parent on submit (REQ-TODO-2 depth).
 *
 * `topLevel` is intentionally **not** forced — at create time the user may
 * pick a non-top-level todo as a parent (the server enforces depth ≤ 3).
 */
import type { Todo, TodosListParams } from '../types/todo.types'
import { refDebounced } from '@vueuse/core'
import { useTodos } from '../composables/useTodos'

const props = defineProps<{
  /** Current todo id, if editing — excluded from results so a row can't parent itself. */
  excludeId?: string | null
  placeholder?: string
  disabled?: boolean
  /**
   * Optional pre-loaded label for the currently selected parent. Used on
   * mount in edit mode so the picker shows the parent title before the
   * search query has populated the option list.
   */
  initialOption?: { id: string, title: string } | null
}>()

const modelValue = defineModel<string | null>({ default: null })

const { t } = useI18n()

const searchTerm = ref('')
const debouncedSearch = refDebounced(searchTerm, 200)

interface ParentOption {
  label: string
  value: string
}

// Always pull at least 10 results so the dropdown fills out even when the
// search input is empty. The server defaults to created_at DESC so the
// most recent todos surface first — sensible "nothing typed yet" baseline.
const queryParams = computed<TodosListParams>(() => {
  const params: TodosListParams = {
    limit: 10,
    completed: false,
    includeDeleted: false,
  }
  const s = debouncedSearch.value.trim()
  if (s)
    params.search = s
  return params
})

const { todos, isLoading } = useTodos(queryParams)

const filtered = computed<Todo[]>(() => {
  if (!props.excludeId)
    return todos.value
  return todos.value.filter(todo => todo.id !== props.excludeId)
})

const options = computed<ParentOption[]>(() => {
  const fromServer = filtered.value.map(todo => ({ label: todo.title, value: todo.id }))
  // If we're editing and the selected parent isn't in the current page of
  // results, include the initial option so the chip renders correctly.
  if (
    props.initialOption
    && modelValue.value === props.initialOption.id
    && !fromServer.some(o => o.value === props.initialOption!.id)
  ) {
    fromServer.unshift({ label: props.initialOption.title, value: props.initialOption.id })
  }
  return fromServer
})

// `UInputMenu` types its `modelValue` as `string | undefined`. Internally we
// model "no parent" as `null` (matches the API + server schema), so we
// translate at the boundary.
const internalValue = computed<string | undefined>({
  get: () => modelValue.value ?? undefined,
  set: (value) => {
    modelValue.value = value ?? null
  },
})
</script>

<template>
  <div class="space-y-1">
    <UInputMenu
      v-model="internalValue"
      v-model:search-term="searchTerm"
      :items="options"
      value-key="value"
      label-key="label"
      :placeholder="placeholder ?? t('todo.form.parent.placeholder')"
      :loading="isLoading"
      :disabled="disabled"
      icon="i-lucide-corner-up-right"
      :ignore-filter="true"
      class="w-full"
    >
      <template #empty>
        <span class="text-xs text-muted">
          {{ t('todo.form.parent.empty') }}
        </span>
      </template>
    </UInputMenu>
    <UButton
      v-if="modelValue"
      variant="ghost"
      color="neutral"
      size="xs"
      icon="i-lucide-x"
      :label="t('todo.form.parent.clear')"
      @click="modelValue = null"
    />
  </div>
</template>
