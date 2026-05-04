<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'

definePageMeta({
  layout: 'auth',
})

useSeoMeta({
  title: 'Forgot Password',
  description: 'Reset your password',
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

const fields = [{
  name: 'email',
  type: 'text' as const,
  label: 'Email',
  placeholder: 'Enter your email address',
  required: true,
}]

const schema = z.object({
  email: z.email('Invalid email'),
})

type Schema = z.output<typeof schema>

const submitted = ref(false)

// Computed error message from API
const apiError = computed(() => {
  if (!forgotPasswordError.value)
    return null
  const err = forgotPasswordError.value as { data?: { statusMessage?: string }, message?: string }
  return err.data?.statusMessage || err.message || 'Request failed'
})

const onSubmit = (payload: FormSubmitEvent<Schema>) => {
  forgotPassword({ email: payload.data.email })
    .then((response) => {
      submitted.value = true
      toast.add({
        title: 'Check your email',
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
      title="Forgot password?"
      icon="i-lucide-key-round"
      :submit="{ label: 'Send reset link', loading: isLoading }"
      @submit="onSubmit"
    >
      <template #description>
        Enter your email address and we'll send you a link to reset your password.
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
  </div>

  <UCard v-else class="max-w-md mx-auto">
    <div class="text-center space-y-4">
      <div class="flex justify-center">
        <UIcon name="i-lucide-mail-check" class="w-16 h-16 text-primary" />
      </div>
      <div>
        <h2 class="text-2xl font-bold mb-2">
          Check your email
        </h2>
        <p class="text-gray-600 dark:text-gray-400">
          If an account exists with this email, you will receive password reset instructions.
        </p>
        <p class="text-sm text-gray-500 dark:text-gray-500 mt-4">
          Didn't receive an email? Check your spam folder or
          <button
            class="text-primary font-medium hover:underline"
            @click="submitted = false"
          >
            try again
          </button>.
        </p>
      </div>
      <UButton
        :to="ROUTES.auth.signIn"
        variant="soft"
        block
      >
        Back to sign in
      </UButton>
    </div>
  </UCard>
</template>
