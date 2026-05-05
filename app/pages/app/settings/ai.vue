<script setup lang="ts">
/**
 * AI configuration page (T-3.1e) — `/app/settings/ai`.
 *
 * Three sections, all gated by the active workspace's `ai:read` (view) and
 * `ai:manage` (write):
 *   1. Workspace AI display name + history limit.
 *   2. Default model picker — only models whose provider has credentials in
 *      this workspace are eligible (REQ-AI-4).
 *   3. Provider credentials list — set / clear API keys. NEVER displays the
 *      stored key (the server doesn't even have it in plaintext after save).
 *
 * Refs: REQ-AI-2, REQ-AI-3, REQ-AI-4, DESIGN-API §AI Configuration.
 */
import { useClearAiCredential, useSetAiCredential } from '~/features/ai/composables/useAiCredentialMutations'
import { useAiCredentials } from '~/features/ai/composables/useAiCredentials'
import { useAiModels } from '~/features/ai/composables/useAiModels'
import { useAiProviders } from '~/features/ai/composables/useAiProviders'
import { useAiSettings } from '~/features/ai/composables/useAiSettings'
import { useUpdateAiSettings } from '~/features/ai/composables/useAiSettingsMutations'
import { usePermissions } from '~/features/permissions'

definePageMeta({
  layout: 'app',
  auth: true,
})

const { t } = useI18n()
const toast = useToast()

useSeoMeta({
  title: () => t('ai.settings.title'),
})

// ─── Permission gating ─────────────────────────────────────────────────────
//
// We don't have an "active workspace id" composable in the client yet
// (T-A.x), so we approximate "can manage" with "is global admin OR has
// `ai:manage` on at least one organisation". The server-side guard is the
// real source of truth — this gate just hides write affordances early.
const permissions = usePermissions()
const canManage = computed(() => {
  if (permissions.isGlobalAdmin.value)
    return true
  const orgPerms = permissions.data.value?.organisations ?? {}
  return Object.values(orgPerms).some(perms => perms.includes('ai:manage'))
})

// ─── Data ──────────────────────────────────────────────────────────────────
const { providers, isLoading: providersLoading, error: providersError } = useAiProviders()
const { credentials } = useAiCredentials()
const { models, isLoading: modelsLoading } = useAiModels()
const { settings, isLoading: settingsLoading } = useAiSettings()

// ─── Local form state mirrors settings, with explicit "save" buttons ───────
const aiDisplayName = ref('')
const historyLimit = ref<number>(30)
const defaultModelId = ref<string | null>(null)

watch(settings, (s) => {
  if (!s)
    return
  aiDisplayName.value = s.aiDisplayName
  historyLimit.value = s.historyLimit
  defaultModelId.value = s.defaultModelId
}, { immediate: true })

// Eligible models: provider must have credentials configured in this workspace.
const eligibleProviderIds = computed(() => new Set(
  providers.value.filter(p => p.hasCredentials).map(p => p.providerId),
))

const eligibleModels = computed(() =>
  models.value.filter(m => eligibleProviderIds.value.has(m.providerId)),
)

const modelOptions = computed(() => [
  { value: null as string | null, label: t('ai.settings.defaultModel.none') },
  ...eligibleModels.value.map(m => ({
    value: m.id,
    label: `${m.providerDisplayName} · ${m.displayName}`,
  })),
])

const settingsMutation = useUpdateAiSettings()

const handleSaveDisplay = async () => {
  try {
    await settingsMutation.mutateAsync({
      aiDisplayName: aiDisplayName.value.trim() || undefined,
      historyLimit: historyLimit.value,
    })
    toast.add({
      title: t('ai.settings.toast.saved.title'),
      color: 'success',
    })
  }
  catch (err) {
    toast.add({
      title: t('ai.settings.toast.error.title'),
      description: err instanceof Error ? err.message : undefined,
      color: 'error',
    })
  }
}

const handleSaveDefaultModel = async () => {
  try {
    await settingsMutation.mutateAsync({
      defaultModelId: defaultModelId.value,
    })
    toast.add({
      title: t('ai.settings.toast.saved.title'),
      color: 'success',
    })
  }
  catch (err) {
    toast.add({
      title: t('ai.settings.toast.error.title'),
      description: err instanceof Error ? err.message : undefined,
      color: 'error',
    })
  }
}

// ─── Credentials modal ─────────────────────────────────────────────────────
const credModalOpen = ref(false)
const credProviderId = ref<string | null>(null)
const credProviderLabel = ref('')
const credInput = ref('')

const setMutation = useSetAiCredential()
const clearMutation = useClearAiCredential()

const openSetCredential = (providerId: string, providerLabel: string) => {
  credProviderId.value = providerId
  credProviderLabel.value = providerLabel
  credInput.value = ''
  credModalOpen.value = true
}

const handleSubmitCredential = async () => {
  if (!credProviderId.value || !credInput.value.trim())
    return
  try {
    await setMutation.mutateAsync({
      providerId: credProviderId.value,
      data: { apiKey: credInput.value.trim() },
    })
    toast.add({
      title: t('ai.settings.credentials.toast.saved.title', { provider: credProviderLabel.value }),
      color: 'success',
    })
    credModalOpen.value = false
    credInput.value = ''
  }
  catch (err) {
    toast.add({
      title: t('ai.settings.credentials.toast.error.title'),
      description: err instanceof Error ? err.message : undefined,
      color: 'error',
    })
  }
}

const handleClearCredential = async (providerId: string, providerLabel: string) => {
  try {
    await clearMutation.mutateAsync(providerId)
    toast.add({
      title: t('ai.settings.credentials.toast.cleared.title', { provider: providerLabel }),
      color: 'success',
    })
  }
  catch (err) {
    toast.add({
      title: t('ai.settings.credentials.toast.error.title'),
      description: err instanceof Error ? err.message : undefined,
      color: 'error',
    })
  }
}

// Use credentials data when available (richer status info) and fall back to
// providers when the credentials query is still warming up.
const providerRows = computed(() => {
  if (credentials.value.length > 0)
    return credentials.value
  return providers.value
})

const isAnyLoading = computed(() => providersLoading.value || settingsLoading.value || modelsLoading.value)
</script>

<template>
  <div class="p-4 md:p-6 space-y-8 max-w-4xl">
    <header>
      <h1 class="text-2xl font-bold text-highlighted">
        {{ t('ai.settings.title') }}
      </h1>
      <p class="text-muted text-sm mt-1">
        {{ t('ai.settings.subtitle') }}
      </p>
    </header>

    <UAlert
      v-if="providersError"
      color="error"
      variant="soft"
      icon="i-lucide-alert-circle"
      :title="t('ai.settings.error.load')"
      :description="providersError.message"
    />

    <div v-if="isAnyLoading && !settings" class="space-y-3">
      <USkeleton class="h-32 w-full" />
      <USkeleton class="h-32 w-full" />
    </div>

    <template v-else>
      <!-- Section 1: Display name + history limit -->
      <UCard>
        <template #header>
          <div>
            <h2 class="text-lg font-semibold text-highlighted">
              {{ t('ai.settings.display.title') }}
            </h2>
            <p class="text-sm text-muted">
              {{ t('ai.settings.display.subtitle') }}
            </p>
          </div>
        </template>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <UFormField :label="t('ai.settings.display.aiDisplayName.label')">
            <UInput
              v-model="aiDisplayName"
              :placeholder="t('ai.settings.display.aiDisplayName.placeholder')"
              :disabled="!canManage"
            />
          </UFormField>

          <UFormField
            :label="t('ai.settings.display.historyLimit.label')"
            :description="t('ai.settings.display.historyLimit.description')"
          >
            <UInput
              v-model.number="historyLimit"
              type="number"
              :min="1"
              :max="200"
              :disabled="!canManage"
            />
          </UFormField>
        </div>

        <template #footer>
          <div class="flex justify-end">
            <UButton
              :label="t('ai.settings.actions.save')"
              :loading="settingsMutation.asyncStatus.value === 'loading'"
              :disabled="!canManage"
              @click="handleSaveDisplay"
            />
          </div>
        </template>
      </UCard>

      <!-- Section 2: Default model -->
      <UCard>
        <template #header>
          <div>
            <h2 class="text-lg font-semibold text-highlighted">
              {{ t('ai.settings.defaultModel.title') }}
            </h2>
            <p class="text-sm text-muted">
              {{ t('ai.settings.defaultModel.subtitle') }}
            </p>
          </div>
        </template>

        <div v-if="eligibleModels.length === 0" class="text-sm text-muted">
          {{ t('ai.settings.defaultModel.empty') }}
        </div>
        <UFormField v-else :label="t('ai.settings.defaultModel.label')">
          <USelectMenu
            v-model="defaultModelId"
            :items="modelOptions"
            value-key="value"
            label-key="label"
            :placeholder="t('ai.settings.defaultModel.none')"
            :disabled="!canManage"
            class="min-w-72"
          />
        </UFormField>

        <template #footer>
          <div class="flex justify-end">
            <UButton
              :label="t('ai.settings.actions.save')"
              :loading="settingsMutation.asyncStatus.value === 'loading'"
              :disabled="!canManage"
              @click="handleSaveDefaultModel"
            />
          </div>
        </template>
      </UCard>

      <!-- Section 3: Provider credentials -->
      <UCard>
        <template #header>
          <div>
            <h2 class="text-lg font-semibold text-highlighted">
              {{ t('ai.settings.credentials.title') }}
            </h2>
            <p class="text-sm text-muted">
              {{ t('ai.settings.credentials.subtitle') }}
            </p>
          </div>
        </template>

        <ul class="divide-y divide-default">
          <li
            v-for="provider in providerRows"
            :key="provider.providerId"
            class="flex flex-wrap items-center justify-between gap-3 py-3"
          >
            <div class="flex items-center gap-3 min-w-0">
              <UIcon name="i-lucide-key" class="size-4 text-muted shrink-0" />
              <div class="min-w-0">
                <p class="font-medium text-highlighted">
                  {{ provider.providerDisplayName }}
                </p>
                <p class="text-xs text-muted truncate">
                  {{ provider.providerKey }}
                </p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <UBadge
                :color="provider.hasCredentials ? 'success' : 'neutral'"
                variant="subtle"
              >
                {{ provider.hasCredentials
                  ? t('ai.settings.credentials.status.configured')
                  : t('ai.settings.credentials.status.not_configured') }}
              </UBadge>
              <UButton
                v-if="canManage"
                color="primary"
                variant="outline"
                size="sm"
                icon="i-lucide-pencil"
                :label="provider.hasCredentials
                  ? t('ai.settings.credentials.actions.replace')
                  : t('ai.settings.credentials.actions.set')"
                @click="openSetCredential(provider.providerId, provider.providerDisplayName)"
              />
              <UButton
                v-if="canManage && provider.hasCredentials"
                color="error"
                variant="ghost"
                size="sm"
                icon="i-lucide-trash"
                :label="t('ai.settings.credentials.actions.clear')"
                :loading="clearMutation.asyncStatus.value === 'loading'"
                @click="handleClearCredential(provider.providerId, provider.providerDisplayName)"
              />
            </div>
          </li>
        </ul>
      </UCard>
    </template>

    <!-- Set-credential modal. We deliberately use a password-style input and
         never preview existing values; the server doesn't even have the key
         in plaintext after the initial save. -->
    <UModal v-model:open="credModalOpen" :title="t('ai.settings.credentials.modal.title', { provider: credProviderLabel })">
      <template #body>
        <div class="space-y-3">
          <p class="text-sm text-muted">
            {{ t('ai.settings.credentials.modal.subtitle') }}
          </p>
          <UFormField :label="t('ai.settings.credentials.modal.label')">
            <UInput
              v-model="credInput"
              type="password"
              autocomplete="off"
              :placeholder="t('ai.settings.credentials.modal.placeholder')"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :label="t('common.cancel')"
            @click="credModalOpen = false"
          />
          <UButton
            color="primary"
            :label="t('ai.settings.credentials.modal.save')"
            :loading="setMutation.asyncStatus.value === 'loading'"
            :disabled="!credInput.trim()"
            @click="handleSubmitCredential"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
