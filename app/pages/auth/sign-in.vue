<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'

definePageMeta({
  layout: 'auth',
})

useSeoMeta({
  title: 'Login',
  description: 'Login to your account to continue',
})

const router = useRouter()
const route = useRoute()
const toast = useToast()

// Redirect if already logged in (but allow anonymous users to sign in for upgrade)
const { isAuthenticated, isAnonymous } = useSession()
watch([isAuthenticated, isAnonymous], ([authenticated, anonymous]) => {
  if (authenticated && !anonymous) {
    const redirect = route.query.redirect as string | undefined
    router.push(redirect || ROUTES.start)
  }
}, { immediate: true })

const { mutateAsync: login, asyncStatus, error: loginError } = useLogin()

const fields = [{
  name: 'email',
  type: 'text' as const,
  label: 'Email',
  placeholder: 'Enter your email',
  required: true,
}, {
  name: 'password',
  label: 'Password',
  type: 'password' as const,
  placeholder: 'Enter your password',
}, {
  name: 'remember',
  label: 'Remember me',
  type: 'checkbox' as const,
}]

const providers = [{
  label: 'Google',
  icon: 'i-simple-icons-google',
  onClick: () => {
    toast.add({ title: 'Google', description: 'Login with Google (coming soon)' })
  },
}, {
  label: 'GitHub',
  icon: 'i-simple-icons-github',
  onClick: () => {
    toast.add({ title: 'GitHub', description: 'Login with GitHub (coming soon)' })
  },
}]

const schema = z.object({
  email: z.email('Invalid email'),
  password: z.string().min(8, 'Must be at least 8 characters'),
  remember: z.boolean().optional().default(false),
})

// Computed error message from API
const apiError = computed(() => {
  if (!loginError.value)
    return null
  const err = loginError.value as { data?: { statusMessage?: string }, message?: string }
  return err.data?.statusMessage || err.message || 'Login failed'
})

const onSubmit = (payload: FormSubmitEvent<z.input<typeof schema>>) => {
  login({ email: payload.data.email, password: payload.data.password, remember: payload.data.remember ?? false })
    .then(() => {
      toast.add({ title: 'Welcome back!', color: 'success' })
      const redirect = route.query.redirect as string | undefined
      router.push(redirect || ROUTES.start)
    })
    .catch(() => {
      // Error is captured in loginError ref
    })
}

const isLoading = computed(() => asyncStatus.value === 'loading')
</script>

<template>
  <UAuthForm
    :fields="fields"
    :schema="schema"
    :providers="providers"
    title="Welcome back"
    icon="i-lucide-lock"
    :submit="{ loading: isLoading }"
    @submit="onSubmit"
  >
    <template #description>
      Don't have an account? <ULink
        :to="ROUTES.auth.signUp"
        class="text-primary font-medium"
      >
        Sign up
      </ULink>.
    </template>

    <template v-if="apiError" #validation>
      <UAlert
        color="error"
        :title="apiError"
        icon="i-lucide-alert-circle"
      />
    </template>

    <template #password-hint>
      <ULink
        :to="ROUTES.auth.forgotPassword"
        class="text-primary font-medium"
        tabindex="-1"
      >
        Forgot password?
      </ULink>
    </template>

    <template #footer>
      By signing in, you agree to our <ULink
        :to="ROUTES.legal.termsOfService"
        class="text-primary font-medium"
      >
        Terms of Service
      </ULink>.
    </template>
  </UAuthForm>
</template>
