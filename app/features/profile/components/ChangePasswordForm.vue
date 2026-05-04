<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'
import { useChangePassword } from '../composables/useProfileMutations'

const emit = defineEmits<{
  success: []
}>()

const MIN_PASSWORD_LENGTH = 8

const schema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`),
  confirmPassword: z.string().min(1, 'Please confirm your new password'),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

type Schema = z.output<typeof schema>

const state = reactive<Schema>({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
})

const { mutateAsync: changePassword, asyncStatus, error } = useChangePassword()

const isLoading = computed(() => asyncStatus.value === 'loading')

const apiError = computed(() => {
  const err = error.value as {
    statusCode?: number
    data?: { statusMessage?: string }
    message?: string
  } | null
  if (!err)
    return null
  if (err.statusCode === 401)
    return 'Current password is incorrect.'
  return err.data?.statusMessage || err.message || 'An unexpected error occurred. Please try again.'
})

const onSubmit = async (event: FormSubmitEvent<Schema>) => {
  try {
    await changePassword({
      currentPassword: event.data.currentPassword,
      newPassword: event.data.newPassword,
    })
    // Clear form on success
    state.currentPassword = ''
    state.newPassword = ''
    state.confirmPassword = ''
    emit('success')
  }
  catch {
    // Error is captured in refs
  }
}
</script>

<template>
  <UForm
    id="password-form"
    :schema="schema"
    :state="state"
    class="space-y-4"
    @submit="onSubmit"
  >
    <!-- Header Card -->
    <UPageCard
      title="Change Password"
      description="Update your password to keep your account secure."
      variant="naked"
      orientation="horizontal"
      class="mb-4"
    >
      <div class="flex gap-2 lg:ms-auto">
        <UButton
          form="password-form"
          type="submit"
          :loading="isLoading"
        >
          Update Password
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
      />
    </Transition>

    <!-- Form Fields Card -->
    <UPageCard variant="subtle">
      <!-- Current Password Field -->
      <UFormField
        name="currentPassword"
        label="Current Password"
        description="Enter your current password to verify your identity."
        required
        class="flex max-sm:flex-col justify-between items-start gap-4"
      >
        <div class="w-full max-w-sm">
          <UInput
            v-model="state.currentPassword"
            type="password"
            placeholder="••••••••"
            autocomplete="current-password"
          />
        </div>
      </UFormField>

      <USeparator />

      <!-- New Password Field -->
      <UFormField
        name="newPassword"
        label="New Password"
        :description="`Must be at least ${MIN_PASSWORD_LENGTH} characters.`"
        required
        class="flex max-sm:flex-col justify-between items-start gap-4"
      >
        <div class="w-full max-w-sm">
          <UInput
            v-model="state.newPassword"
            type="password"
            placeholder="••••••••"
            autocomplete="new-password"
          />
        </div>
      </UFormField>

      <USeparator />

      <!-- Confirm Password Field -->
      <UFormField
        name="confirmPassword"
        label="Confirm New Password"
        description="Re-enter your new password to confirm."
        required
        class="flex max-sm:flex-col justify-between items-start gap-4"
      >
        <div class="w-full max-w-sm">
          <UInput
            v-model="state.confirmPassword"
            type="password"
            placeholder="••••••••"
            autocomplete="new-password"
          />
        </div>
      </UFormField>
    </UPageCard>
  </UForm>
</template>
