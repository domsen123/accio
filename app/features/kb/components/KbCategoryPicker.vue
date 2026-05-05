<script setup lang="ts">
/**
 * Single-select category picker for KB entries (T-1.9).
 *
 * Flat list — the categories tree picker (T-1.11) supersedes this UI for
 * deeply nested hierarchies. Empty selection means "no category".
 *
 * Inline category creation: typing a name not present in the list and
 * confirming via the "Create" item triggers the create-mutation. On success
 * the new id is selected.
 */
import type { KbCategory } from '../types/kb.types'
import { useKbCategories } from '../composables/useKbCategories'
import { useCreateKbCategory } from '../composables/useKbEntryMutations'

defineProps<{
  placeholder?: string
  disabled?: boolean
}>()

const modelValue = defineModel<string | null>({ default: null })

const { t } = useI18n()
const toast = useToast()

const { categories, isLoading } = useKbCategories()

interface CategoryOption {
  label: string
  value: string | null
}

const options = computed<CategoryOption[]>(() => [
  { label: t('kb.form.category.none'), value: null },
  ...categories.value.map(c => ({ label: c.name, value: c.id })),
])

const { mutateAsync: createCategory, asyncStatus } = useCreateKbCategory()

const onCreate = async (name: string) => {
  const trimmed = name.trim()
  if (!trimmed)
    return
  try {
    const { category } = await createCategory({ name: trimmed }) as { category: KbCategory }
    modelValue.value = category.id
    toast.add({
      title: t('kb.tags.create.successCategory', { name: trimmed }),
      color: 'success',
    })
  }
  catch {
    toast.add({
      title: t('kb.tags.create.errorCategory', { name: trimmed }),
      color: 'error',
    })
  }
}

// Normalise null <-> undefined for USelectMenu.
const internalValue = computed<string | null>({
  get: () => modelValue.value ?? null,
  set: (value) => {
    modelValue.value = value || null
  },
})
</script>

<template>
  <USelectMenu
    v-model="internalValue"
    :items="options"
    value-key="value"
    label-key="label"
    :placeholder="placeholder ?? t('kb.form.category.placeholder')"
    :loading="isLoading || asyncStatus === 'loading'"
    :disabled="disabled"
    icon="i-lucide-folder"
    create-item
    class="w-full"
    @create="onCreate"
  />
</template>
