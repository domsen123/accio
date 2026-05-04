<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'
import { useRequestEmailChange } from '../composables/useProfileMutations'

const props = defineProps<{
  currentEmail: string
}>()

const open = defineModel<boolean>('open', { default: false })

const schema = z.object({
  email: z.string().trim().email('Valid email is required'),
})

type Schema = z.output<typeof schema>

const state = reactive<Schema>({
  email: '',
})

const { mutateAsync: requestEmailChange, asyncStatus, error, reset } = useRequestEmailChange()

const isLoading = computed(() => asyncStatus.value === 'loading')
const isSuccess = ref(false)

const apiError = computed(() => {
  const err = error.value as {
    statusCode?: number
    data?: { statusMessage?: string }
    message?: string
  } | null
  if (!err)
    return null
  if (err.statusCode === 409)
    return 'This email is already in use by another account.'
  if (err.statusCode === 400)
    return err.data?.statusMessage || 'Invalid email address.'
  return err.data?.statusMessage || err.message || 'An unexpected error occurred. Please try again.'
})

const onSubmit = async (event: FormSubmitEvent<Schema>) => {
  try {
    await requestEmailChange(event.data)
    isSuccess.value = true
  }
  catch {
    // Error is captured in refs
  }
}

const onClose = () => {
  open.value = false
  // Reset state after modal closes
  setTimeout(() => {
    state.email = ''
    isSuccess.value = false
    reset()
  }, 300)
}

// Validate that new email is different from current
const isDifferentEmail = computed(() => {
  return state.email.toLowerCase().trim() !== props.currentEmail.toLowerCase()
})
</script>

<template>
  <UModal
    v-model:open="open"
    title="Change Email Address"
    :close="{
      onClick: onClose,
    }"
  >
    <template #body>
      <!-- Success State -->
      <div v-if="isSuccess" class="text-center py-4">
        <div class="mx-auto w-12 h-12 rounded-full bg-(--ui-color-success-50) flex items-center justify-center mb-4">
          <UIcon name="i-lucide-mail-check" class="w-6 h-6 text-(--ui-color-success-500)" />
        </div>
        <h3 class="text-lg font-medium text-(--ui-text-highlighted) mb-2">
          Check your email
        </h3>
        <p class="text-sm text-(--ui-text-muted)">
          We've sent a verification link to <strong>{{ state.email }}</strong>.
          Click the link in your email to confirm the change.
        </p>
        <UButton
          class="mt-6"
          @click="onClose"
        >
          Done
        </UButton>
      </div>

      <!-- Form State -->
      <UForm
        v-else
        :schema="schema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <p class="text-sm text-(--ui-text-muted)">
          Enter your new email address. We'll send a verification link to confirm the change.
        </p>

        <!-- Error Alert -->
        <UAlert
          v-if="apiError"
          color="error"
          variant="subtle"
          icon="i-lucide-alert-triangle"
          :title="apiError"
        />

        <UFormField
          name="email"
          label="New Email Address"
          required
        >
          <UInput
            v-model="state.email"
            type="email"
            placeholder="newemail@example.com"
            autocomplete="email"
          />
        </UFormField>

        <p v-if="state.email && !isDifferentEmail" class="text-sm text-(--ui-color-warning-500)">
          New email must be different from your current email.
        </p>

        <div class="flex justify-end gap-2 pt-2">
          <UButton
            variant="ghost"
            @click="onClose"
          >
            Cancel
          </UButton>
          <UButton
            type="submit"
            :loading="isLoading"
            :disabled="!isDifferentEmail"
          >
            Send Verification Email
          </UButton>
        </div>
      </UForm>
    </template>
  </UModal>
</template>
