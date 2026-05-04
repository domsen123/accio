<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { AdminBlogCategory } from '../types/admin.types'
import * as z from 'zod'

const props = defineProps<{
  category?: AdminBlogCategory | null
  isLoading?: boolean
}>()

const emit = defineEmits<{
  submit: [data: { name: string, slug: string }]
  cancel: []
}>()

const isOpen = defineModel<boolean>('open', { default: false })

const isEditing = computed(() => !!props.category)
const slugManuallyEdited = ref(false)

const NAME_MAX_LENGTH = 100
const SLUG_MAX_LENGTH = 100

const schema = z.object({
  name: z.string().trim().min(1, 'Category name is required').max(NAME_MAX_LENGTH),
  slug: z.string().trim().min(1, 'Slug is required').max(SLUG_MAX_LENGTH).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens only'),
})

type Schema = z.output<typeof schema>

const state = reactive<Schema>({
  name: '',
  slug: '',
})

const generateSlug = (name: string): string =>
  name.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, SLUG_MAX_LENGTH)

watch([isOpen, () => props.category], ([open, category]) => {
  if (open) {
    state.name = category?.name ?? ''
    state.slug = category?.slug ?? ''
    slugManuallyEdited.value = !!category
  }
}, { immediate: true })

watch(() => state.name, (newName) => {
  if (!slugManuallyEdited.value) {
    state.slug = generateSlug(newName)
  }
})

const onSlugInput = () => {
  slugManuallyEdited.value = true
}

const onSubmit = (event: FormSubmitEvent<Schema>) => {
  emit('submit', event.data)
}

const onCancel = () => {
  isOpen.value = false
  emit('cancel')
}
</script>

<template>
  <UModal v-model:open="isOpen">
    <template #content>
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center size-10 rounded-lg bg-primary/10">
              <UIcon name="i-lucide-folder" class="size-5 text-primary" />
            </div>
            <div>
              <h3 class="text-base font-semibold text-highlighted">
                {{ isEditing ? 'Edit Category' : 'Create Category' }}
              </h3>
              <p class="text-sm text-muted">
                {{ isEditing ? 'Update the category details' : 'Add a new blog category' }}
              </p>
            </div>
          </div>
        </template>

        <UForm
          :schema="schema"
          :state="state"
          class="space-y-4"
          @submit="onSubmit"
        >
          <UFormField
            label="Name"
            name="name"
            required
          >
            <UInput
              v-model="state.name"
              placeholder="e.g. Tutorials, News"
              :maxlength="NAME_MAX_LENGTH"
              autofocus
            />
          </UFormField>

          <UFormField
            label="Slug"
            name="slug"
            required
          >
            <UInput
              v-model="state.slug"
              placeholder="e.g. tutorials, news"
              :maxlength="SLUG_MAX_LENGTH"
              @input="onSlugInput"
            />
          </UFormField>

          <div class="flex items-center justify-end gap-3 pt-4">
            <UButton
              variant="ghost"
              color="neutral"
              :disabled="isLoading"
              @click="onCancel"
            >
              Cancel
            </UButton>
            <UButton
              type="submit"
              :loading="isLoading"
            >
              <template v-if="!isLoading" #leading>
                <UIcon :name="isEditing ? 'i-lucide-check' : 'i-lucide-plus'" class="size-4" />
              </template>
              {{ isEditing ? 'Update Category' : 'Create Category' }}
            </UButton>
          </div>
        </UForm>
      </UCard>
    </template>
  </UModal>
</template>
