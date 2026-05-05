<script setup lang="ts">
/**
 * Multi-select KB-entry picker for the Todo form (T-2.6).
 *
 * The user types a query and the dropdown options come from
 * `GET /api/kb/entries?search=...&limit=10`. The picker stores an array of
 * KB entry **ids** because the API takes `kbEntryIds`. The currently
 * selected entries are still shown as chips even after the user types a
 * new search — we resolve them via the supplied `initialOptions` so we
 * don't lose the selection when the result page changes.
 */
import type { KbEntriesListParams } from '~/features/kb/types/kb.types'
import { refDebounced } from '@vueuse/core'
import { useKbEntries } from '~/features/kb/composables/useKbEntries'

const props = defineProps<{
  placeholder?: string
  disabled?: boolean
  /**
   * Pre-loaded labels for currently selected entries (id + title). Used so
   * the chip list renders in edit mode before the user has typed anything,
   * and so already-picked entries stay rendered after the search query
   * narrows the results.
   */
  initialOptions?: Array<{ id: string, title: string }>
}>()

const modelValue = defineModel<string[]>({ default: () => [] })

const { t } = useI18n()

const searchTerm = ref('')
const debouncedSearch = refDebounced(searchTerm, 200)

const queryParams = computed<KbEntriesListParams>(() => {
  const params: KbEntriesListParams = {
    limit: 10,
    includeArchived: false,
    includeDeleted: false,
  }
  const s = debouncedSearch.value.trim()
  if (s)
    params.search = s
  return params
})

const { entries, isLoading } = useKbEntries(queryParams)

interface KbEntryOption {
  label: string
  value: string
}

// Local cache of `id -> title` so the chip rendering survives subsequent
// searches that don't include the already-picked entry in the result page.
const knownTitles = reactive<Record<string, string>>({})

watchEffect(() => {
  for (const entry of entries.value)
    knownTitles[entry.id] = entry.title
})

watchEffect(() => {
  for (const opt of props.initialOptions ?? [])
    knownTitles[opt.id] = opt.title
})

const options = computed<KbEntryOption[]>(() => {
  const fromServer = entries.value.map(entry => ({ label: entry.title, value: entry.id }))
  // Include any already-selected entries that aren't in the current page so
  // they remain visible / removable in the chip list.
  const seen = new Set(fromServer.map(o => o.value))
  for (const id of modelValue.value) {
    if (!seen.has(id)) {
      const label = knownTitles[id] ?? id
      fromServer.push({ label, value: id })
      seen.add(id)
    }
  }
  return fromServer
})
</script>

<template>
  <USelectMenu
    v-model="modelValue"
    v-model:search-term="searchTerm"
    multiple
    :items="options"
    value-key="value"
    label-key="label"
    :placeholder="placeholder ?? t('todo.form.kbLinks.placeholder')"
    :loading="isLoading"
    :disabled="disabled"
    icon="i-lucide-link"
    :ignore-filter="true"
    class="w-full"
  >
    <template #empty>
      <span class="text-xs text-muted">
        {{ t('todo.form.kbLinks.empty') }}
      </span>
    </template>
  </USelectMenu>
</template>
