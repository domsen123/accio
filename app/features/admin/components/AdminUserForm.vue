<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { AdminUser } from '../types/admin.types'
import * as z from 'zod'

const props = defineProps<{
  user: AdminUser
}>()

const emit = defineEmits<{
  success: [user: AdminUser]
  cancel: []
}>()

const NAME_MAX_LENGTH = 100
const EMAIL_MAX_LENGTH = 255

const schema = z.object({
  name: z.string().trim().max(NAME_MAX_LENGTH, `Name must be ${NAME_MAX_LENGTH} characters or less`).optional(),
  email: z.email('Invalid email address').trim().max(EMAIL_MAX_LENGTH, `Email must be ${EMAIL_MAX_LENGTH} characters or less`),
  emailVerified: z.boolean(),
})

type Schema = z.output<typeof schema>

const state = reactive<Schema>({
  name: props.user.name ?? '',
  email: props.user.email ?? '',
  emailVerified: props.user.emailVerified,
})

const { mutateAsync: updateUser, asyncStatus, error } = useUpdateUser()

const isLoading = computed(() => asyncStatus.value === 'loading')

const apiError = computed(() => {
  const err = error.value as {
    statusCode?: number
    data?: { statusMessage?: string }
    message?: string
  } | null
  if (!err)
    return null
  if (err.statusCode === 409)
    return 'A user with this email already exists. Please choose a different email.'
  return err.data?.statusMessage || err.message || 'An unexpected error occurred. Please try again.'
})

const onSubmit = async (event: FormSubmitEvent<Schema>) => {
  try {
    const result = await updateUser({
      id: props.user.id,
      data: {
        name: event.data.name || null,
        email: event.data.email,
        emailVerified: event.data.emailVerified,
      },
    })
    emit('success', result.user)
  }
  catch {
    // Error is captured in refs
  }
}
</script>

<template>
  <UForm
    id="user-form"
    :schema="schema"
    :state="state"
    class="space-y-4"
    @submit="onSubmit"
  >
    <!-- Header Card -->
    <UPageCard
      title="Edit User"
      description="Update user details."
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
          form="user-form"
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
        class="animate-shake"
      />
    </Transition>

    <!-- Form Fields Card -->
    <UPageCard variant="subtle">
      <!-- Avatar -->
      <div class="flex pb-4">
        <AdminUserAvatar
          :user-id="user.id"
          :user-name="user.name"
          :user-email="user.email"
        />
      </div>

      <!-- Email Field -->
      <UFormField
        name="email"
        label="Email Address"
        description="User's email address for login and notifications."
        required
      >
        <UInput
          v-model="state.email"
          type="email"
          placeholder="user@example.com"
          autocomplete="email"
          :maxlength="EMAIL_MAX_LENGTH"
        />
      </UFormField>

      <!-- Name Field -->
      <UFormField
        name="name"
        label="Full Name"
        description="User's display name."
      >
        <UInput
          v-model="state.name"
          placeholder="John Doe"
          autocomplete="name"
          :maxlength="NAME_MAX_LENGTH"
        />
      </UFormField>

      <!-- Email Verified Toggle -->
      <UFormField
        name="emailVerified"
        label="Email Verified"
        description="Whether the user's email address has been verified."
        class="flex max-sm:flex-col justify-between items-center gap-4"
      >
        <USwitch v-model="state.emailVerified" />
      </UFormField>
    </UPageCard>

    <!-- Metadata Card -->
    <UPageCard variant="subtle">
      <div class="text-sm text-muted space-y-2">
        <div>
          <span class="font-medium">User ID:</span>
          <span class="ml-2 font-mono text-xs">{{ user.id }}</span>
        </div>
        <div>
          <span class="font-medium">Created:</span>
          <span class="ml-2">{{ new Date(user.createdAt).toLocaleString() }}</span>
        </div>
        <div>
          <span class="font-medium">Updated:</span>
          <span class="ml-2">{{ new Date(user.updatedAt).toLocaleString() }}</span>
        </div>
      </div>
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
