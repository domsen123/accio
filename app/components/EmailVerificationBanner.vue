<script setup lang="ts">
const { user, isAnonymous } = useSession()
const toast = useToast()
const { t } = useI18n()
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
      title: t('shell.email-verification-banner.resend-success-title'),
      description: response.message,
      color: 'success',
    })
  }
  catch (error) {
    const err = error as { data?: { statusMessage?: string }, message?: string }
    toast.add({
      title: t('shell.email-verification-banner.resend-failed-title'),
      description: err.data?.statusMessage || err.message || t('shell.email-verification-banner.resend-failed-description'),
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
            <span class="font-medium">{{ $t('shell.email-verification-banner.title') }}</span>
            <span class="text-muted hidden sm:inline"> {{ $t('shell.email-verification-banner.description') }}</span>
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
            {{ $t('shell.email-verification-banner.resend') }}
          </UButton>
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-x"
            :aria-label="$t('shell.email-verification-banner.dismiss')"
            @click="handleDismiss"
          />
        </div>
      </div>
    </UContainer>
  </div>
</template>
