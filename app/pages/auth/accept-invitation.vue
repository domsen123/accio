<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'
import { useAcceptInvitation, useValidateInvitation } from '~/features/organisation-invitations'

definePageMeta({
  layout: 'auth',
})

useSeoMeta({
  title: 'Accept Invitation',
  description: 'Accept your organisation invitation and create your account',
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
watch(token, (t) => {
  if (!t) {
    toast.add({
      title: 'Invalid invitation link',
      description: 'Please check your email for the correct invitation link.',
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
      title: 'Invalid invitation',
      description: 'This invitation link has expired or is invalid.',
      color: 'error',
    })
    router.push(ROUTES.auth.signIn)
  }
})

const { mutateAsync: acceptInvitation, asyncStatus, error: acceptError } = useAcceptInvitation()

const fields = [{
  name: 'name',
  type: 'text' as const,
  label: 'Full Name',
  placeholder: 'Enter your name (optional)',
}, {
  name: 'password',
  type: 'password' as const,
  label: 'Password',
  placeholder: 'Create a password',
  required: true,
}, {
  name: 'confirmPassword',
  type: 'password' as const,
  label: 'Confirm Password',
  placeholder: 'Confirm your password',
  required: true,
}]

const schema = z.object({
  name: z.string().trim().optional(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine(data => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

type Schema = z.output<typeof schema>

const apiError = computed(() => {
  if (!acceptError.value)
    return null
  const err = acceptError.value as { data?: { statusMessage?: string }, message?: string }
  return err.data?.statusMessage || err.message || 'Failed to accept invitation'
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
        title: 'Welcome!',
        description: `You've joined ${response.organisationName}. Redirecting...`,
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
    title="Accept Invitation"
    icon="i-lucide-user-plus"
    :submit="{ label: 'Create Account & Join', loading: isLoading }"
    @submit="onSubmit"
  >
    <template #description>
      <div class="space-y-1">
        <p>You've been invited to join <strong>{{ validation.organisationName }}</strong>.</p>
        <p class="text-sm text-muted">
          Create your account using <strong>{{ validation.email }}</strong>
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
      Already have an account? <ULink
        :to="ROUTES.auth.signIn"
        class="text-primary font-medium"
      >
        Sign in
      </ULink>.
    </template>
  </UAuthForm>
</template>
