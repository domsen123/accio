<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'

definePageMeta({
  layout: 'auth',
})

const { t } = useI18n()

useSeoMeta({
  title: () => t('auth.reset-password.page-title'),
  description: () => t('auth.reset-password.page-description'),
})

const router = useRouter()
const route = useRoute()
const toast = useToast()

// Get token from URL
const token = computed(() => route.query.token as string | null)

// Redirect if already logged in
const { isAuthenticated } = useSession()
watch(isAuthenticated, (authenticated) => {
  if (authenticated) {
    router.push(ROUTES.start)
  }
}, { immediate: true })

// Redirect if no token
watch(token, (tk) => {
  if (!tk) {
    toast.add({
      title: t('auth.reset-password.invalid-link-title'),
      description: t('auth.reset-password.invalid-link-description'),
      color: 'error',
    })
    router.push(ROUTES.auth.forgotPassword)
  }
}, { immediate: true })

// Validate token
const { data: tokenValidation, status: validationStatus } = useValidateResetToken(token)

// Watch for invalid token
watch(tokenValidation, (validation) => {
  if (validation && !validation.valid) {
    toast.add({
      title: t('auth.reset-password.expired-link-title'),
      description: t('auth.reset-password.expired-link-description'),
      color: 'error',
    })
    router.push(ROUTES.auth.forgotPassword)
  }
})

const { mutateAsync: resetPassword, asyncStatus, error: resetPasswordError } = useResetPassword()

const fields = computed(() => [{
  name: 'password',
  type: 'password' as const,
  label: t('auth.reset-password.new-password-label'),
  placeholder: t('auth.reset-password.new-password-placeholder'),
  required: true,
}, {
  name: 'confirmPassword',
  type: 'password' as const,
  label: t('auth.common.confirm-password-label'),
  placeholder: t('auth.common.confirm-password-placeholder'),
  required: true,
}])

const schema = z.object({
  password: z.string().min(8, t('auth.common.errors.password-min')),
  confirmPassword: z.string().min(1, t('auth.common.errors.confirm-password-required')),
}).refine(data => data.password === data.confirmPassword, {
  message: t('auth.common.errors.passwords-no-match'),
  path: ['confirmPassword'],
})

type Schema = z.output<typeof schema>

// Computed error message from API
const apiError = computed(() => {
  if (!resetPasswordError.value)
    return null
  const err = resetPasswordError.value as { data?: { statusMessage?: string }, message?: string }
  return err.data?.statusMessage || err.message || t('auth.reset-password.reset-failed')
})

const onSubmit = (payload: FormSubmitEvent<Schema>) => {
  if (!token.value)
    return

  resetPassword({
    token: token.value,
    password: payload.data.password,
  })
    .then((response) => {
      toast.add({
        title: t('auth.reset-password.success-title'),
        description: response.message,
        color: 'success',
      })
      router.push(ROUTES.auth.signIn)
    })
    .catch(() => {
      // Error is captured in resetPasswordError ref
    })
}

const isLoading = computed(() => asyncStatus.value === 'loading')
const isValidating = computed(() => validationStatus.value === 'pending')
</script>

<template>
  <div v-if="isValidating" class="flex justify-center items-center min-h-[400px]">
    <UIcon name="i-lucide-loader-circle" class="w-8 h-8 animate-spin text-primary" />
  </div>

  <UAuthForm
    v-else-if="tokenValidation?.valid"
    :fields="fields"
    :schema="schema"
    :title="$t('auth.reset-password.title')"
    icon="i-lucide-lock-keyhole"
    :submit="{ label: $t('auth.reset-password.submit'), loading: isLoading }"
    @submit="onSubmit"
  >
    <template #description>
      {{ $t('auth.reset-password.description') }}
    </template>

    <template v-if="apiError" #validation>
      <UAlert
        color="error"
        :title="apiError"
        icon="i-lucide-alert-circle"
      />
    </template>

    <template #footer>
      {{ $t('auth.reset-password.remember') }}
      <ULink
        :to="ROUTES.auth.signIn"
        class="text-primary font-medium"
      >
        {{ $t('auth.reset-password.sign-in-link') }}
      </ULink>.
    </template>
  </UAuthForm>
</template>
