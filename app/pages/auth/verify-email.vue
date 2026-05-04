<script setup lang="ts">
definePageMeta({
  layout: 'auth',
})

useSeoMeta({
  title: 'Verify Email',
  description: 'Verify your email address',
})

const router = useRouter()
const route = useRoute()
const toast = useToast()

// Get token from URL
const token = computed(() => route.query.token as string | null)

// States
const isVerifying = ref(true)
const verificationSuccess = ref(false)
const alreadyVerified = ref(false)
const verificationError = ref<string | null>(null)

// Verify email on mount
onMounted(async () => {
  if (!token.value) {
    verificationError.value = 'Invalid verification link. Please check your email for the correct link.'
    isVerifying.value = false
    return
  }

  try {
    const response = await $fetch('/api/auth/verify-email', {
      query: { token: token.value },
    })

    verificationSuccess.value = response.success
    alreadyVerified.value = response.alreadyVerified

    if (response.success) {
      toast.add({
        title: response.alreadyVerified ? 'Already verified' : 'Email verified!',
        description: response.alreadyVerified
          ? 'Your email was already verified.'
          : 'Your email has been successfully verified.',
        color: 'success',
      })
    }
  }
  catch (error) {
    const err = error as { data?: { statusMessage?: string }, message?: string }
    verificationError.value = err.data?.statusMessage || err.message || 'Verification failed'
  }
  finally {
    isVerifying.value = false
  }
})

const goToSignIn = () => {
  router.push(ROUTES.auth.signIn)
}

const goToHome = () => {
  router.push(ROUTES.start)
}
</script>

<template>
  <div class="flex flex-col items-center justify-center min-h-[400px] p-6">
    <!-- Loading state -->
    <div v-if="isVerifying" class="text-center">
      <UIcon name="i-lucide-loader-circle" class="w-12 h-12 animate-spin text-primary mb-4" />
      <h2 class="text-xl font-semibold">
        Verifying your email...
      </h2>
      <p class="text-muted mt-2">
        Please wait while we verify your email address.
      </p>
    </div>

    <!-- Success state -->
    <div v-else-if="verificationSuccess" class="text-center max-w-md">
      <div class="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
        <UIcon name="i-lucide-check-circle" class="w-8 h-8 text-success" />
      </div>
      <h2 class="text-2xl font-semibold mb-2">
        {{ alreadyVerified ? 'Already Verified' : 'Email Verified!' }}
      </h2>
      <p class="text-muted mb-6">
        {{ alreadyVerified
          ? 'Your email address was already verified. You can continue using your account.'
          : 'Your email address has been successfully verified. You can now enjoy all features of your account.'
        }}
      </p>
      <div class="flex gap-3 justify-center">
        <UButton
          color="primary"
          size="lg"
          @click="goToHome"
        >
          Go to Dashboard
        </UButton>
      </div>
    </div>

    <!-- Error state -->
    <div v-else class="text-center max-w-md">
      <div class="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-4">
        <UIcon name="i-lucide-x-circle" class="w-8 h-8 text-error" />
      </div>
      <h2 class="text-2xl font-semibold mb-2">
        Verification Failed
      </h2>
      <p class="text-muted mb-6">
        {{ verificationError || 'The verification link is invalid or has expired.' }}
      </p>
      <div class="flex gap-3 justify-center">
        <UButton
          color="neutral"
          variant="outline"
          size="lg"
          @click="goToSignIn"
        >
          Sign In
        </UButton>
      </div>
      <p class="text-sm text-muted mt-4">
        If you need a new verification link, sign in and request one from your account settings.
      </p>
    </div>
  </div>
</template>
