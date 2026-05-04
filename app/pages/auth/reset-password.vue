<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'

definePageMeta({
  layout: 'auth',
})

useSeoMeta({
  title: 'Reset Password',
  description: 'Create a new password for your account',
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
watch(token, (t) => {
  if (!t) {
    toast.add({
      title: 'Invalid reset link',
      description: 'Please request a new password reset link.',
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
      title: 'Reset link expired',
      description: 'This password reset link has expired or been used. Please request a new one.',
      color: 'error',
    })
    router.push(ROUTES.auth.forgotPassword)
  }
})

const { mutateAsync: resetPassword, asyncStatus, error: resetPasswordError } = useResetPassword()

const fields = [{
  name: 'password',
  type: 'password' as const,
  label: 'New Password',
  placeholder: 'Enter your new password',
  required: true,
}, {
  name: 'confirmPassword',
  type: 'password' as const,
  label: 'Confirm Password',
  placeholder: 'Confirm your new password',
  required: true,
}]

const schema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine(data => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

type Schema = z.output<typeof schema>

// Computed error message from API
const apiError = computed(() => {
  if (!resetPasswordError.value)
    return null
  const err = resetPasswordError.value as { data?: { statusMessage?: string }, message?: string }
  return err.data?.statusMessage || err.message || 'Password reset failed'
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
        title: 'Password reset successful',
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
    title="Reset your password"
    icon="i-lucide-lock-keyhole"
    :submit="{ label: 'Reset password', loading: isLoading }"
    @submit="onSubmit"
  >
    <template #description>
      Enter your new password below.
    </template>

    <template v-if="apiError" #validation>
      <UAlert
        color="error"
        :title="apiError"
        icon="i-lucide-alert-circle"
      />
    </template>

    <template #footer>
      Remember your password? <ULink
        :to="ROUTES.auth.signIn"
        class="text-primary font-medium"
      >
        Sign in
      </ULink>.
    </template>
  </UAuthForm>
</template>
