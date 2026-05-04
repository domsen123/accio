<script setup lang="ts">
definePageMeta({
  layout: 'auth',
})

const { t } = useI18n()

useSeoMeta({
  title: () => t('auth.verify-email.page-title'),
  description: () => t('auth.verify-email.page-description'),
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
    verificationError.value = t('auth.verify-email.missing-token')
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
        title: response.alreadyVerified
          ? t('auth.verify-email.toast-already-verified-title')
          : t('auth.verify-email.toast-verified-title'),
        description: response.alreadyVerified
          ? t('auth.verify-email.toast-already-verified-description')
          : t('auth.verify-email.toast-verified-description'),
        color: 'success',
      })
    }
  }
  catch (error) {
    const err = error as { data?: { statusMessage?: string }, message?: string }
    verificationError.value = err.data?.statusMessage || err.message || t('auth.verify-email.failed-title')
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
        {{ $t('auth.verify-email.verifying-title') }}
      </h2>
      <p class="text-muted mt-2">
        {{ $t('auth.verify-email.verifying-description') }}
      </p>
    </div>

    <!-- Success state -->
    <div v-else-if="verificationSuccess" class="text-center max-w-md">
      <div class="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
        <UIcon name="i-lucide-check-circle" class="w-8 h-8 text-success" />
      </div>
      <h2 class="text-2xl font-semibold mb-2">
        {{ alreadyVerified ? $t('auth.verify-email.already-verified-title') : $t('auth.verify-email.verified-title') }}
      </h2>
      <p class="text-muted mb-6">
        {{ alreadyVerified
          ? $t('auth.verify-email.already-verified-description')
          : $t('auth.verify-email.verified-description')
        }}
      </p>
      <div class="flex gap-3 justify-center">
        <UButton
          color="primary"
          size="lg"
          @click="goToHome"
        >
          {{ $t('auth.verify-email.go-to-dashboard') }}
        </UButton>
      </div>
    </div>

    <!-- Error state -->
    <div v-else class="text-center max-w-md">
      <div class="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-4">
        <UIcon name="i-lucide-x-circle" class="w-8 h-8 text-error" />
      </div>
      <h2 class="text-2xl font-semibold mb-2">
        {{ $t('auth.verify-email.failed-title') }}
      </h2>
      <p class="text-muted mb-6">
        {{ verificationError || $t('auth.verify-email.invalid-link') }}
      </p>
      <div class="flex gap-3 justify-center">
        <UButton
          color="neutral"
          variant="outline"
          size="lg"
          @click="goToSignIn"
        >
          {{ $t('auth.verify-email.go-to-sign-in') }}
        </UButton>
      </div>
      <p class="text-sm text-muted mt-4">
        {{ $t('auth.verify-email.resend-hint') }}
      </p>
    </div>
  </div>
</template>
