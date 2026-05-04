<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'

definePageMeta({
  layout: 'auth',
})

const { t } = useI18n()

useSeoMeta({
  title: () => t('auth.forgot-password.page-title'),
  description: () => t('auth.forgot-password.page-description'),
})

const router = useRouter()
const toast = useToast()

// Redirect if already logged in
const { isAuthenticated } = useSession()
watch(isAuthenticated, (authenticated) => {
  if (authenticated) {
    router.push(ROUTES.start)
  }
}, { immediate: true })

const { mutateAsync: forgotPassword, asyncStatus, error: forgotPasswordError } = useForgotPassword()

const fields = computed(() => [{
  name: 'email',
  type: 'text' as const,
  label: t('auth.common.email-label'),
  placeholder: t('auth.common.email-placeholder'),
  required: true,
}])

const schema = z.object({
  email: z.email(t('auth.common.errors.invalid-email')),
})

type Schema = z.output<typeof schema>

const submitted = ref(false)

// Computed error message from API
const apiError = computed(() => {
  if (!forgotPasswordError.value)
    return null
  const err = forgotPasswordError.value as { data?: { statusMessage?: string }, message?: string }
  return err.data?.statusMessage || err.message || t('auth.forgot-password.request-failed')
})

const onSubmit = (payload: FormSubmitEvent<Schema>) => {
  forgotPassword({ email: payload.data.email })
    .then((response) => {
      submitted.value = true
      toast.add({
        title: t('auth.forgot-password.check-email-toast'),
        description: response.message,
        color: 'success',
      })
    })
    .catch(() => {
      // Error is captured in forgotPasswordError ref
    })
}

const isLoading = computed(() => asyncStatus.value === 'loading')
</script>

<template>
  <div v-if="!submitted">
    <UAuthForm
      :fields="fields"
      :schema="schema"
      :title="$t('auth.forgot-password.title')"
      icon="i-lucide-key-round"
      :submit="{ label: $t('auth.forgot-password.submit'), loading: isLoading }"
      @submit="onSubmit"
    >
      <template #description>
        {{ $t('auth.forgot-password.description') }}
      </template>

      <template v-if="apiError" #validation>
        <UAlert
          color="error"
          :title="apiError"
          icon="i-lucide-alert-circle"
        />
      </template>

      <template #footer>
        {{ $t('auth.forgot-password.remember') }}
        <ULink
          :to="ROUTES.auth.signIn"
          class="text-primary font-medium"
        >
          {{ $t('auth.forgot-password.sign-in-link') }}
        </ULink>.
      </template>
    </UAuthForm>
  </div>

  <UCard v-else class="max-w-md mx-auto">
    <div class="text-center space-y-4">
      <div class="flex justify-center">
        <UIcon name="i-lucide-mail-check" class="w-16 h-16 text-primary" />
      </div>
      <div>
        <h2 class="text-2xl font-bold mb-2">
          {{ $t('auth.forgot-password.submitted-title') }}
        </h2>
        <p class="text-gray-600 dark:text-gray-400">
          {{ $t('auth.forgot-password.submitted-description') }}
        </p>
        <p class="text-sm text-gray-500 dark:text-gray-500 mt-4">
          {{ $t('auth.forgot-password.no-email-hint') }}
          <button
            class="text-primary font-medium hover:underline"
            @click="submitted = false"
          >
            {{ $t('auth.forgot-password.try-again') }}
          </button>.
        </p>
      </div>
      <UButton
        :to="ROUTES.auth.signIn"
        variant="soft"
        block
      >
        {{ $t('auth.forgot-password.back-to-sign-in') }}
      </UButton>
    </div>
  </UCard>
</template>
