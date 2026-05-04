<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { UserProfile } from '../types/profile.types'
import * as z from 'zod'
import { usePendingEmailChange } from '../composables/usePendingEmailChange'
import { useCancelEmailChange, useUpdateProfile } from '../composables/useProfileMutations'
import EmailChangeForm from './EmailChangeForm.vue'

const props = defineProps<{
  profile: UserProfile
}>()

const emit = defineEmits<{
  success: []
}>()

const NAME_MAX_LENGTH = 100

const schema = z.object({
  name: z.string().trim().max(NAME_MAX_LENGTH, `Name must be ${NAME_MAX_LENGTH} characters or less`).optional(),
})

type Schema = z.output<typeof schema>

const state = reactive<Schema>({
  name: props.profile.name ?? '',
})

const { mutateAsync: updateProfile, asyncStatus, error } = useUpdateProfile()
const { pending: pendingEmailChange } = usePendingEmailChange()
const { mutateAsync: cancelEmailChange, asyncStatus: cancelStatus } = useCancelEmailChange()

const isLoading = computed(() => asyncStatus.value === 'loading')
const isCancelling = computed(() => cancelStatus.value === 'loading')

// Modal state for email change
const isEmailChangeModalOpen = ref(false)

const apiError = computed(() => {
  const err = error.value as {
    statusCode?: number
    data?: { statusMessage?: string }
    message?: string
  } | null
  if (!err)
    return null
  return err.data?.statusMessage || err.message || 'An unexpected error occurred. Please try again.'
})

const onSubmit = async (event: FormSubmitEvent<Schema>) => {
  try {
    await updateProfile(event.data)
    emit('success')
  }
  catch {
    // Error is captured in refs
  }
}

const onCancelEmailChange = async () => {
  try {
    await cancelEmailChange()
  }
  catch {
    // Error handling
  }
}

const formatExpiryTime = (expiresAt: string) => {
  const date = new Date(expiresAt)
  return date.toLocaleString()
}
</script>

<template>
  <UForm
    id="profile-form"
    :schema="schema"
    :state="state"
    class="space-y-4"
    @submit="onSubmit"
  >
    <!-- Header Card -->
    <UPageCard
      title="Profile"
      description="Update your personal information."
      variant="naked"
      orientation="horizontal"
      class="mb-4"
    >
      <div class="flex gap-2 lg:ms-auto">
        <UButton
          form="profile-form"
          type="submit"
          :loading="isLoading"
        >
          Save Changes
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
      <!-- Name Field -->
      <UFormField
        name="name"
        label="Name"
        description="Your display name."
        class="flex max-sm:flex-col justify-between items-start gap-4"
      >
        <div class="w-full max-w-sm">
          <UInput
            v-model="state.name"
            placeholder="John Doe"
            autocomplete="name"
            :maxlength="NAME_MAX_LENGTH"
          />
        </div>
      </UFormField>

      <USeparator />

      <!-- Email Field (Read-only with change button) -->
      <div class="flex max-sm:flex-col justify-between items-start gap-4">
        <div class="flex-1">
          <div class="flex items-center gap-2">
            <label class="text-sm font-medium text-(--ui-text-highlighted)">Email</label>
          </div>
          <p class="text-sm text-(--ui-text-muted) mt-0.5">
            Your email address for login and notifications.
          </p>
        </div>
        <div class="w-full max-w-sm space-y-2">
          <div class="flex items-center gap-2">
            <UInput
              :model-value="profile.email"
              type="email"
              disabled
              class="flex-1"
            />
            <UButton
              variant="soft"
              @click="isEmailChangeModalOpen = true"
            >
              Change
            </UButton>
          </div>

          <!-- Pending Email Change Alert -->
          <UAlert
            v-if="pendingEmailChange"
            color="info"
            variant="subtle"
            icon="i-lucide-mail"
            class="mt-2"
          >
            <template #title>
              Email change pending
            </template>
            <template #description>
              <p class="text-sm">
                We sent a verification email to <strong>{{ pendingEmailChange.newEmail }}</strong>.
                Please check your inbox and click the link to confirm your new email address.
              </p>
              <p class="text-xs text-(--ui-text-muted) mt-1">
                Expires: {{ formatExpiryTime(pendingEmailChange.expiresAt) }}
              </p>
              <UButton
                variant="link"
                size="xs"
                color="neutral"
                :loading="isCancelling"
                class="mt-2 -ml-2"
                @click="onCancelEmailChange"
              >
                Cancel email change
              </UButton>
            </template>
          </UAlert>
        </div>
      </div>
    </UPageCard>

    <!-- Email Change Modal -->
    <EmailChangeForm
      v-model:open="isEmailChangeModalOpen"
      :current-email="profile.email"
    />
  </UForm>
</template>
