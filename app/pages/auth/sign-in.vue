<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'

definePageMeta({
  layout: 'auth',
})

const { t } = useI18n()

useSeoMeta({
  title: () => t('auth.sign-in.page-title'),
  description: () => t('auth.sign-in.page-description'),
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

const fields = computed(() => [{
  name: 'email',
  type: 'text' as const,
  label: t('auth.common.email-label'),
  placeholder: t('auth.common.email-placeholder'),
  required: true,
}, {
  name: 'password',
  label: t('auth.common.password-label'),
  type: 'password' as const,
  placeholder: t('auth.common.password-placeholder'),
}, {
  name: 'remember',
  label: t('auth.common.remember-me'),
  type: 'checkbox' as const,
}])

const providers = computed(() => [{
  label: t('auth.common.providers.google'),
  icon: 'i-simple-icons-google',
  onClick: () => {
    toast.add({
      title: t('auth.common.providers.google'),
      description: t('auth.common.providers.google-coming-soon'),
    })
  },
}, {
  label: t('auth.common.providers.github'),
  icon: 'i-simple-icons-github',
  onClick: () => {
    toast.add({
      title: t('auth.common.providers.github'),
      description: t('auth.common.providers.github-coming-soon'),
    })
  },
}])

const schema = z.object({
  email: z.email(t('auth.common.errors.invalid-email')),
  password: z.string().min(8, t('auth.common.errors.password-min')),
  remember: z.boolean().optional().default(false),
})

// Computed error message from API
const apiError = computed(() => {
  if (!loginError.value)
    return null
  const err = loginError.value as { data?: { statusMessage?: string }, message?: string }
  return err.data?.statusMessage || err.message || t('auth.sign-in.login-failed')
})

const onSubmit = (payload: FormSubmitEvent<z.input<typeof schema>>) => {
  login({ email: payload.data.email, password: payload.data.password, remember: payload.data.remember ?? false })
    .then(() => {
      toast.add({ title: t('auth.sign-in.welcome-back'), color: 'success' })
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
    :title="$t('auth.sign-in.title')"
    icon="i-lucide-lock"
    :submit="{ label: $t('auth.sign-in.submit'), loading: isLoading }"
    @submit="onSubmit"
  >
    <template #description>
      {{ $t('auth.sign-in.no-account') }}
      <ULink
        :to="ROUTES.auth.signUp"
        class="text-primary font-medium"
      >
        {{ $t('auth.sign-in.sign-up-link') }}
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
        {{ $t('auth.sign-in.forgot-password') }}
      </ULink>
    </template>

    <template #footer>
      {{ $t('auth.sign-in.footer-prefix') }}
      <ULink
        :to="ROUTES.legal.termsOfService"
        class="text-primary font-medium"
      >
        {{ $t('auth.sign-in.terms-link') }}
      </ULink>{{ $t('auth.sign-in.footer-suffix') }}
    </template>
  </UAuthForm>
</template>
