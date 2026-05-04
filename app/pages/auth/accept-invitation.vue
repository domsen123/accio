<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'
import { useAcceptInvitation, useValidateInvitation } from '~/features/organisation-invitations'

definePageMeta({
  layout: 'auth',
})

const { t } = useI18n()

useSeoMeta({
  title: () => t('auth.accept-invitation.page-title'),
  description: () => t('auth.accept-invitation.page-description'),
})

const router = useRouter()
const route = useRoute()
const toast = useToast()

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
      title: t('auth.accept-invitation.invalid-link-title'),
      description: t('auth.accept-invitation.invalid-link-description'),
      color: 'error',
    })
    router.push(ROUTES.auth.signIn)
  }
}, { immediate: true })

// Validate token
const { data: validation, status: validationStatus } = useValidateInvitation(token)

// Watch for invalid token
watch(validation, (val) => {
  if (val && !val.valid) {
    toast.add({
      title: t('auth.accept-invitation.invalid-invitation-title'),
      description: t('auth.accept-invitation.invalid-invitation-description'),
      color: 'error',
    })
    router.push(ROUTES.auth.signIn)
  }
})

const { mutateAsync: acceptInvitation, asyncStatus, error: acceptError } = useAcceptInvitation()

const fields = computed(() => [{
  name: 'name',
  type: 'text' as const,
  label: t('auth.common.name-label'),
  placeholder: t('auth.accept-invitation.name-placeholder'),
}, {
  name: 'password',
  type: 'password' as const,
  label: t('auth.common.password-label'),
  placeholder: t('auth.accept-invitation.password-placeholder'),
  required: true,
}, {
  name: 'confirmPassword',
  type: 'password' as const,
  label: t('auth.common.confirm-password-label'),
  placeholder: t('auth.common.confirm-password-placeholder'),
  required: true,
}])

const schema = z.object({
  name: z.string().trim().optional(),
  password: z.string().min(8, t('auth.common.errors.password-min')),
  confirmPassword: z.string().min(1, t('auth.common.errors.confirm-password-required')),
}).refine(data => data.password === data.confirmPassword, {
  message: t('auth.common.errors.passwords-no-match'),
  path: ['confirmPassword'],
})

type Schema = z.output<typeof schema>

const apiError = computed(() => {
  if (!acceptError.value)
    return null
  const err = acceptError.value as { data?: { statusMessage?: string }, message?: string }
  return err.data?.statusMessage || err.message || t('auth.accept-invitation.accept-failed')
})

const onSubmit = (payload: FormSubmitEvent<Schema>) => {
  if (!token.value)
    return

  acceptInvitation({
    token: token.value,
    data: {
      password: payload.data.password,
      name: payload.data.name || undefined,
    },
  })
    .then((response) => {
      toast.add({
        title: t('auth.accept-invitation.welcome-title'),
        description: t('auth.accept-invitation.welcome-description', { organisation: response.organisationName }),
        color: 'success',
      })
      router.push(ROUTES.start)
    })
    .catch(() => {
      // Error is captured in acceptError ref
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
    v-else-if="validation?.valid"
    :fields="fields"
    :schema="schema"
    :title="$t('auth.accept-invitation.title')"
    icon="i-lucide-user-plus"
    :submit="{ label: $t('auth.accept-invitation.submit'), loading: isLoading }"
    @submit="onSubmit"
  >
    <template #description>
      <div class="space-y-1">
        <p>
          <i18n-t keypath="auth.accept-invitation.description-line-1">
            <template #organisation>
              <strong>{{ validation.organisationName }}</strong>
            </template>
          </i18n-t>
        </p>
        <p class="text-sm text-muted">
          <i18n-t keypath="auth.accept-invitation.description-line-2">
            <template #email>
              <strong>{{ validation.email }}</strong>
            </template>
          </i18n-t>
        </p>
      </div>
    </template>

    <template v-if="apiError" #validation>
      <UAlert
        color="error"
        :title="apiError"
        icon="i-lucide-alert-circle"
      />
    </template>

    <template #footer>
      {{ $t('auth.accept-invitation.have-account') }}
      <ULink
        :to="ROUTES.auth.signIn"
        class="text-primary font-medium"
      >
        {{ $t('auth.accept-invitation.sign-in-link') }}
      </ULink>.
    </template>
  </UAuthForm>
</template>
