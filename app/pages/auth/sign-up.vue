<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'

definePageMeta({
  layout: 'auth',
})

const { t } = useI18n()

useSeoMeta({
  title: () => t('auth.sign-up.page-title'),
  description: () => t('auth.sign-up.page-description'),
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

const fields = computed(() => [{
  name: 'name',
  type: 'text' as const,
  label: t('auth.common.name-label'),
  placeholder: t('auth.common.name-placeholder'),
}, {
  name: 'email',
  type: 'text' as const,
  label: t('auth.common.email-label'),
  placeholder: t('auth.common.email-placeholder'),
}, {
  name: 'password',
  label: t('auth.common.password-label'),
  type: 'password' as const,
  placeholder: t('auth.common.password-placeholder'),
}])

const providers = computed(() => [{
  label: t('auth.common.providers.google'),
  icon: 'i-simple-icons-google',
  onClick: () => {
    toast.add({
      title: t('auth.common.providers.google'),
      description: t('auth.common.providers.google-signup-coming-soon'),
    })
  },
}, {
  label: t('auth.common.providers.github'),
  icon: 'i-simple-icons-github',
  onClick: () => {
    toast.add({
      title: t('auth.common.providers.github'),
      description: t('auth.common.providers.github-signup-coming-soon'),
    })
  },
}])

const schema = z.object({
  name: z.string().min(1, t('auth.common.errors.name-required')),
  email: z.email(t('auth.common.errors.invalid-email')),
  password: z.string().min(8, t('auth.common.errors.password-min')),
})

type Schema = z.output<typeof schema>

// Computed error message from API
const apiError = computed(() => {
  if (!registerError.value)
    return null
  const err = registerError.value as { statusCode?: number, data?: { statusMessage?: string }, message?: string }
  // Handle 409 conflict (email exists)
  if (err.statusCode === 409) {
    return t('auth.sign-up.email-exists')
  }
  return err.data?.statusMessage || err.message || t('auth.sign-up.registration-failed')
})

const onSubmit = (payload: FormSubmitEvent<Schema>) => {
  register({
    email: payload.data.email,
    password: payload.data.password,
    name: payload.data.name,
  })
    .then(() => {
      toast.add({
        title: t('auth.sign-up.account-created-title'),
        description: t('auth.sign-up.account-created-description'),
        color: 'success',
      })
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
    :title="$t('auth.sign-up.title')"
    :submit="{ label: $t('auth.sign-up.submit'), loading: isLoading }"
    @submit="onSubmit"
  >
    <template #description>
      {{ $t('auth.sign-up.have-account') }}
      <ULink
        :to="ROUTES.auth.signIn"
        class="text-primary font-medium"
      >
        {{ $t('auth.sign-up.sign-in-link') }}
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
      {{ $t('auth.sign-up.footer-prefix') }}
      <ULink
        :to="ROUTES.legal.termsOfService"
        class="text-primary font-medium"
      >
        {{ $t('auth.sign-in.terms-link') }}
      </ULink>{{ $t('auth.sign-up.footer-suffix') }}
    </template>
  </UAuthForm>
</template>
