<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'

definePageMeta({
  layout: 'auth',
})

useSeoMeta({
  title: 'Sign up',
  description: 'Create an account to get started',
})

const router = useRouter()
const route = useRoute()
const toast = useToast()

// Redirect if already logged in (but allow anonymous users to sign up for upgrade)
const { isAuthenticated, isAnonymous } = useSession()
watch([isAuthenticated, isAnonymous], ([authenticated, anonymous]) => {
  if (authenticated && !anonymous) {
    const redirect = route.query.redirect as string | undefined
    router.push(redirect || ROUTES.start)
  }
}, { immediate: true })

const { mutateAsync: register, asyncStatus, error: registerError } = useRegister()

const fields = [{
  name: 'name',
  type: 'text' as const,
  label: 'Name',
  placeholder: 'Enter your name',
}, {
  name: 'email',
  type: 'text' as const,
  label: 'Email',
  placeholder: 'Enter your email',
}, {
  name: 'password',
  label: 'Password',
  type: 'password' as const,
  placeholder: 'Enter your password',
}]

const providers = [{
  label: 'Google',
  icon: 'i-simple-icons-google',
  onClick: () => {
    toast.add({ title: 'Google', description: 'Sign up with Google (coming soon)' })
  },
}, {
  label: 'GitHub',
  icon: 'i-simple-icons-github',
  onClick: () => {
    toast.add({ title: 'GitHub', description: 'Sign up with GitHub (coming soon)' })
  },
}]

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.email('Invalid email'),
  password: z.string().min(8, 'Must be at least 8 characters'),
})

type Schema = z.output<typeof schema>

// Computed error message from API
const apiError = computed(() => {
  if (!registerError.value)
    return null
  const err = registerError.value as { statusCode?: number, data?: { statusMessage?: string }, message?: string }
  // Handle 409 conflict (email exists)
  if (err.statusCode === 409) {
    return 'An account with this email already exists'
  }
  return err.data?.statusMessage || err.message || 'Registration failed'
})

const onSubmit = (payload: FormSubmitEvent<Schema>) => {
  register({
    email: payload.data.email,
    password: payload.data.password,
    name: payload.data.name,
  })
    .then(() => {
      toast.add({ title: 'Account created!', description: 'Welcome aboard.', color: 'success' })
      const redirect = route.query.redirect as string | undefined
      router.push(redirect || ROUTES.start)
    })
    .catch(() => {
      // Error is captured in registerError ref
    })
}

const isLoading = computed(() => asyncStatus.value === 'loading')
</script>

<template>
  <UAuthForm
    :fields="fields"
    :schema="schema"
    :providers="providers"
    title="Create an account"
    :submit="{ label: 'Create account', loading: isLoading }"
    @submit="onSubmit"
  >
    <template #description>
      Already have an account? <ULink
        :to="ROUTES.auth.signIn"
        class="text-primary font-medium"
      >
        Login
      </ULink>.
    </template>

    <template v-if="apiError" #validation>
      <UAlert
        color="error"
        :title="apiError"
        icon="i-lucide-alert-circle"
      />
    </template>

    <template #footer>
      By signing up, you agree to our <ULink
        :to="ROUTES.legal.termsOfService"
        class="text-primary font-medium"
      >
        Terms of Service
      </ULink>.
    </template>
  </UAuthForm>
</template>
