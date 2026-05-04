<script setup lang="ts">
import type { AdminAuthProvider } from '../types/admin.types'

const props = defineProps<{
  provider: AdminAuthProvider
  loading?: boolean
}>()

const emit = defineEmits<{
  update: [data: { enabled: boolean, config: Record<string, unknown> }]
}>()

const enabled = ref(props.provider.enabled)
const sessionDurationDays = ref(
  props.provider.provider === 'anonymous'
    ? (props.provider.config.sessionDurationDays as number) ?? 30
    : 0,
)

watch(() => props.provider, (p) => {
  enabled.value = p.enabled
  if (p.provider === 'anonymous') {
    sessionDurationDays.value = (p.config.sessionDurationDays as number) ?? 30
  }
}, { deep: true })

const isCredentials = computed(() => props.provider.provider === 'credentials')
const isAnonymous = computed(() => props.provider.provider === 'anonymous')

const isDirty = computed(() => {
  if (enabled.value !== props.provider.enabled)
    return true
  if (isAnonymous.value) {
    const original = (props.provider.config.sessionDurationDays as number) ?? 30
    if (sessionDurationDays.value !== original)
      return true
  }
  return false
})

const providerLabel = computed(() => {
  const labels: Record<string, string> = {
    credentials: 'Email & Password',
    anonymous: 'Anonymous',
  }
  return labels[props.provider.provider] ?? props.provider.provider
})

const providerDescription = computed(() => {
  const descriptions: Record<string, string> = {
    credentials: 'Standard email and password authentication. Users register and sign in with their credentials.',
    anonymous: 'Allow users to browse without creating an account. Anonymous sessions can be upgraded to full accounts later.',
  }
  return descriptions[props.provider.provider] ?? ''
})

const onSave = () => {
  const config: Record<string, unknown> = { ...props.provider.config }
  if (isAnonymous.value) {
    config.sessionDurationDays = sessionDurationDays.value
  }
  emit('update', { enabled: enabled.value, config })
}
</script>

<template>
  <div>
    <!-- Header Card -->
    <UPageCard
      :title="providerLabel"
      :description="providerDescription"
      variant="naked"
      orientation="horizontal"
    >
      <div v-if="!isCredentials" class="flex gap-2 lg:ms-auto">
        <UButton
          label="Save"
          :disabled="!isDirty"
          :loading="loading"
          @click="onSave"
        />
      </div>
    </UPageCard>

    <!-- Form Fields Card -->
    <UPageCard variant="subtle">
      <UFormField
        label="Enabled"
        :description="isCredentials ? 'Credentials authentication is always enabled.' : 'Enable or disable this authentication provider.'"
        class="flex max-sm:flex-col justify-between items-center gap-4"
      >
        <USwitch
          v-model="enabled"
          :disabled="isCredentials"
        />
      </UFormField>

      <UFormField
        v-if="isAnonymous"
        label="Session Duration (days)"
        description="How long anonymous sessions remain active before expiring."
      >
        <UInput
          v-model.number="sessionDurationDays"
          type="number"
          :min="1"
          :max="365"
          class="w-32"
        />
      </UFormField>
    </UPageCard>
  </div>
</template>
