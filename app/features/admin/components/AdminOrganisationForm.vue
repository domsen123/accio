<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { AdminOrganisation } from '../types/admin.types'
import * as z from 'zod'

const props = defineProps<{
  organisation?: AdminOrganisation
}>()

const emit = defineEmits<{
  success: [organisation: AdminOrganisation]
  cancel: []
}>()

const NAME_MAX_LENGTH = 100
const SLUG_MAX_LENGTH = 50

const isEditMode = computed(() => !!props.organisation)
const slugManuallyEdited = ref(false)

const schema = z.object({
  name: z.string().trim().min(1, 'Organisation name is required').max(NAME_MAX_LENGTH, `Name must be ${NAME_MAX_LENGTH} characters or less`),
  slug: z.string().trim().min(1, 'URL slug is required').max(SLUG_MAX_LENGTH, `Slug must be ${SLUG_MAX_LENGTH} characters or less`).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens only'),
})

type Schema = z.output<typeof schema>

const state = reactive<Schema>({
  name: props.organisation?.name ?? '',
  slug: props.organisation?.slug ?? '',
})

const generateSlug = (name: string): string =>
  name.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, SLUG_MAX_LENGTH)

watch(() => state.name, (newName) => {
  if (!isEditMode.value && !slugManuallyEdited.value) {
    state.slug = generateSlug(newName)
  }
})

const onSlugInput = () => {
  slugManuallyEdited.value = true
}

const resetSlugAutoGeneration = () => {
  slugManuallyEdited.value = false
  state.slug = generateSlug(state.name)
}

const { mutateAsync: createOrg, asyncStatus: createStatus, error: createError } = useCreateOrganisation()
const { mutateAsync: updateOrg, asyncStatus: updateStatus, error: updateError } = useUpdateOrganisation()

const isLoading = computed(() =>
  createStatus.value === 'loading' || updateStatus.value === 'loading',
)

const apiError = computed(() => {
  const err = (createError.value || updateError.value) as {
    statusCode?: number
    data?: { statusMessage?: string }
    message?: string
  } | null
  if (!err)
    return null
  if (err.statusCode === 409)
    return 'An organisation with this slug already exists. Please choose a different slug.'
  return err.data?.statusMessage || err.message || 'An unexpected error occurred. Please try again.'
})

const onSubmit = async (event: FormSubmitEvent<Schema>) => {
  try {
    const result = isEditMode.value
      ? await updateOrg({ id: props.organisation!.id, data: event.data })
      : await createOrg(event.data)
    emit('success', result.organisation)
  }
  catch {
    // Error is captured in refs
  }
}

// Preview URL
const previewUrl = computed(() => {
  if (!state.slug)
    return null
  return `app.example.com/${state.slug}`
})
</script>

<template>
  <UForm
    id="organisation-form"
    :schema="schema"
    :state="state"
    class="space-y-4"
    @submit="onSubmit"
  >
    <!-- Header Card -->
    <UPageCard
      :title="isEditMode ? 'Edit Organisation' : 'New Organisation'"
      :description="isEditMode ? 'Update the organisation details below.' : 'Fill in the details to create a new organisation.'"
      variant="naked"
      orientation="horizontal"
      class="mb-4"
    >
      <div class="flex gap-2 lg:ms-auto">
        <UButton
          variant="ghost"
          color="neutral"
          :disabled="isLoading"
          @click="emit('cancel')"
        >
          Cancel
        </UButton>
        <UButton
          form="organisation-form"
          type="submit"
          :loading="isLoading"
        >
          {{ isEditMode ? 'Save Changes' : 'Create Organisation' }}
        </UButton>
      </div>
    </UPageCard>

    <!-- Error Alert -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-1"
    >
      <UAlert
        v-if="apiError"
        color="error"
        variant="subtle"
        icon="i-lucide-alert-triangle"
        :title="apiError"
        class="animate-shake"
      />
    </Transition>

    <!-- Form Fields Card -->
    <UPageCard variant="subtle">
      <!-- Name Field -->
      <UFormField
        name="name"
        label="Organisation Name"
        description="Will appear on receipts, invoices, and other communication."
        required
      >
        <UInput
          v-model="state.name"
          placeholder="Acme Corporation"
          autocomplete="organization"
          :maxlength="NAME_MAX_LENGTH"
        />
      </UFormField>

      <USeparator />

      <!-- Slug Field -->
      <UFormField
        name="slug"
        label="URL Slug"
        required
      >
        <template #description>
          <span>
            A unique identifier used in URLs.
            <template v-if="isEditMode">
              <span class="text-muted">(Cannot be changed)</span>
            </template>
            <template v-else-if="slugManuallyEdited">
              <button
                type="button"
                class="text-primary hover:text-primary/80 transition-colors font-medium inline-flex items-center gap-1 ms-1"
                @click="resetSlugAutoGeneration"
              >
                <UIcon name="i-lucide-refresh-cw" class="size-3" />
                Auto-generate
              </button>
            </template>
          </span>
        </template>
        <UInput
          v-model="state.slug"
          placeholder="acme-corp"
          :maxlength="SLUG_MAX_LENGTH"
          :disabled="isEditMode"
          @input="onSlugInput"
        >
          <template v-if="isEditMode" #trailing>
            <UIcon name="i-lucide-lock" class="size-4 text-muted" />
          </template>
        </UInput>
        <!-- URL Preview -->
        <Transition
          enter-active-class="transition duration-200 ease-out"
          enter-from-class="opacity-0"
          enter-to-class="opacity-100"
          leave-active-class="transition duration-150 ease-in"
          leave-from-class="opacity-100"
          leave-to-class="opacity-0"
        >
          <p v-if="previewUrl" class="mt-2 text-xs text-muted">
            <UIcon name="i-lucide-globe" class="size-3 inline-block me-1" />
            {{ previewUrl }}
          </p>
        </Transition>
      </UFormField>
    </UPageCard>
  </UForm>
</template>

<style scoped>
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-2px); }
  20%, 40%, 60%, 80% { transform: translateX(2px); }
}

.animate-shake {
  animation: shake 0.5s ease-in-out;
}
</style>
