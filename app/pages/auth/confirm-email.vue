<script setup lang="ts">
import { useConfirmEmailChange } from '~/features/profile/composables/useProfileMutations'

definePageMeta({
  layout: 'auth',
})

const route = useRoute()
const router = useRouter()

const token = computed(() => route.query.token as string | undefined)

const { mutateAsync: confirmEmailChange, asyncStatus, error } = useConfirmEmailChange()

const isLoading = computed(() => asyncStatus.value === 'loading')
const isSuccess = ref(false)
const newEmail = ref('')

const apiError = computed(() => {
  const err = error.value as {
    statusCode?: number
    data?: { statusMessage?: string }
    message?: string
  } | null
  if (!err)
    return null
  if (err.statusCode === 400)
    return 'This link is invalid or has expired. Please request a new email change.'
  if (err.statusCode === 409)
    return 'This email is no longer available. Please try a different email address.'
  return err.data?.statusMessage || err.message || 'An unexpected error occurred. Please try again.'
})

const confirmChange = async () => {
  if (!token.value)
    return

  try {
    const result = await confirmEmailChange(token.value)
    isSuccess.value = true
    newEmail.value = result.email
  }
  catch {
    // Error is captured in refs
  }
}

const goToSettings = () => {
  router.push('/settings/profile')
}

// Auto-confirm on mount if token is present
onMounted(() => {
  if (token.value) {
    confirmChange()
  }
})
</script>

<template>
  <div class="w-full max-w-md">
    <!-- No Token -->
    <div v-if="!token" class="text-center py-4">
      <div class="mx-auto w-12 h-12 rounded-full bg-error-50 flex items-center justify-center mb-4">
        <UIcon name="i-lucide-x" class="w-6 h-6 text-error-500" />
      </div>
      <h2 class="text-xl font-semibold text-highlighted mb-2">
        Invalid Link
      </h2>
      <p class="text-sm text-muted mb-6">
        This email confirmation link is missing a token. Please use the link from your email.
      </p>
      <UButton @click="goToSettings">
        Go to Settings
      </UButton>
    </div>

    <!-- Loading -->
    <div v-else-if="isLoading" class="text-center py-8">
      <UIcon name="i-lucide-loader-2" class="w-8 h-8 text-primary-500 animate-spin mx-auto mb-4" />
      <p class="text-sm text-muted">
        Confirming your email change...
      </p>
    </div>

    <!-- Success -->
    <div v-else-if="isSuccess" class="text-center py-4">
      <div class="mx-auto w-12 h-12 rounded-full bg-success-50 flex items-center justify-center mb-4">
        <UIcon name="i-lucide-check" class="w-6 h-6 text-success-500" />
      </div>
      <h2 class="text-xl font-semibold text-highlighted mb-2">
        Email Changed
      </h2>
      <p class="text-sm text-muted mb-6">
        Your email has been successfully changed to <strong>{{ newEmail }}</strong>.
      </p>
      <UButton @click="goToSettings">
        Go to Settings
      </UButton>
    </div>

    <!-- Error -->
    <div v-else-if="apiError" class="text-center py-4">
      <div class="mx-auto w-12 h-12 rounded-full bg-(--ui-color-error-50) flex items-center justify-center mb-4">
        <UIcon name="i-lucide-x" class="w-6 h-6 text-(--ui-color-error-500)" />
      </div>
      <h2 class="text-xl font-semibold text-(--ui-text-highlighted) mb-2">
        Unable to Change Email
      </h2>
      <p class="text-sm text-(--ui-text-muted) mb-6">
        {{ apiError }}
      </p>
      <UButton @click="goToSettings">
        Go to Settings
      </UButton>
    </div>
  </div>
</template>
