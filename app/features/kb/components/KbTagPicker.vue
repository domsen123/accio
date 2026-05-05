<script setup lang="ts">
/**
 * Multi-select tag picker for KB entries (T-1.9).
 *
 * The picker manages an array of tag *names* (not ids). The KB API's
 * create/update endpoint accepts `tagNames` and runs `findOrCreate` server-
 * side, so any new name typed here is materialised on entry save without a
 * separate POST. Surfacing names rather than ids keeps the form payload
 * simple and avoids prematurely creating tags the user might back out of.
 *
 * The dropdown is populated from the workspace tag list so the user can
 * quickly pick an existing tag; "Create" lets them add a new name on the
 * fly and append it to the model.
 */
import { useKbTags } from '../composables/useKbTags'

defineProps<{
  placeholder?: string
  disabled?: boolean
}>()

const modelValue = defineModel<string[]>({ default: () => [] })

const { t } = useI18n()
const { tags, isLoading } = useKbTags()

interface TagOption {
  label: string
  value: string
}

const options = computed<TagOption[]>(() => {
  const fromServer = tags.value.map(tag => ({ label: tag.name, value: tag.name }))
  // Include any locally added names so the chip list renders even before the
  // workspace tag list refreshes.
  const known = new Set(fromServer.map(o => o.value.toLowerCase()))
  const local = modelValue.value
    .filter(v => !known.has(v.toLowerCase()))
    .map(name => ({ label: name, value: name }))
  return [...fromServer, ...local]
})

const onCreate = (name: string) => {
  const trimmed = name.trim()
  if (!trimmed)
    return
  if (modelValue.value.some(v => v.toLowerCase() === trimmed.toLowerCase()))
    return
  modelValue.value = [...modelValue.value, trimmed]
}
</script>

<template>
  <USelectMenu
    v-model="modelValue"
    multiple
    :items="options"
    value-key="value"
    label-key="label"
    :placeholder="placeholder ?? t('kb.form.tags.placeholder')"
    :loading="isLoading"
    :disabled="disabled"
    icon="i-lucide-tag"
    create-item
    class="w-full"
    @create="onCreate"
  />
</template>
