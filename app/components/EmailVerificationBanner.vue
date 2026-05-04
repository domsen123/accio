<script setup lang="ts">
const { user, isAnonymous } = useSession()
const toast = useToast()
const { mutateAsync: resendVerification, asyncStatus } = useResendVerification()

const dismissed = ref(false)

const isLoading = computed(() => asyncStatus.value === 'loading')

const shouldShow = computed(() => {
  return user.value && !isAnonymous.value && !user.value.emailVerified && !dismissed.value
})

const handleResend = async () => {
  try {
    const response = await resendVerification()
    toast.add({
      title: 'Verification email sent',
      description: response.message,
      color: 'success',
    })
  }
  catch (error) {
    const err = error as { data?: { statusMessage?: string }, message?: string }
    toast.add({
      title: 'Failed to send email',
      description: err.data?.statusMessage || err.message || 'Please try again later.',
      color: 'error',
    })
  }
}

const handleDismiss = () => {
  dismissed.value = true
}
</script>

<template>
  <div
    v-if="shouldShow"
    class="bg-warning/10 border-b border-warning/20"
  >
    <UContainer>
      <div class="py-2 flex items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <UIcon
            name="i-lucide-mail-warning"
            class="w-5 h-5 text-warning shrink-0"
          />
          <p class="text-sm">
            <span class="font-medium">Please verify your email address.</span>
            <span class="text-muted hidden sm:inline"> Check your inbox for a verification link.</span>
          </p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <UButton
            size="xs"
            color="warning"
            variant="soft"
            :loading="isLoading"
            @click="handleResend"
          >
            Resend email
          </UButton>
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-x"
            aria-label="Dismiss"
            @click="handleDismiss"
          />
        </div>
      </div>
    </UContainer>
  </div>
</template>
