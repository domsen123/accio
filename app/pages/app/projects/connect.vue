<script setup lang="ts">
/**
 * Projects connection page (T-4.8) — `/app/projects/connect`.
 *
 * PAT input + status display + revoke. Validate-on-save is delegated to the
 * server's `connect` endpoint (which calls `GET /user` before persisting).
 * The page also exposes an explicit "Validate now" button that hits
 * `/api/projects/connection/validate` so users can re-check stored tokens
 * after they rotate scopes upstream.
 *
 * Refs: REQ-PROJ-1.
 */
import { usePermissions } from '~/features/permissions'
import {
  useConnectGh,
  useGhConnection,
  useRevokeGh,
  useValidateGh,
} from '~/features/projects/composables/useGhConnection'

definePageMeta({
  layout: 'app',
  auth: true,
})

const { t, locale } = useI18n()
const toast = useToast()

useSeoMeta({
  title: () => t('projects.connection.title'),
})

const permissions = usePermissions()
const canManage = computed(() => {
  if (permissions.isGlobalAdmin.value)
    return true
  const orgPerms = permissions.data.value?.organisations ?? {}
  return Object.values(orgPerms).some(perms => perms.includes('project:manage'))
})

const { status, isConnected, isLoading, error } = useGhConnection()

const tokenInput = ref('')

const connectMutation = useConnectGh()
const revokeMutation = useRevokeGh()
const validateMutation = useValidateGh()

const handleSave = async () => {
  const token = tokenInput.value.trim()
  if (!token)
    return
  try {
    await connectMutation.mutateAsync({ token })
    tokenInput.value = ''
    toast.add({
      title: t('projects.connection.toast.saved.title'),
      color: 'success',
    })
  }
  catch (err) {
    toast.add({
      title: t('projects.connection.toast.error.title'),
      description: err instanceof Error ? err.message : undefined,
      color: 'error',
    })
  }
}

const handleValidate = async () => {
  try {
    const result = await validateMutation.mutateAsync()
    if (result.valid) {
      toast.add({
        title: t('projects.connection.validate.successTitle'),
        description: result.ghUserLogin,
        color: 'success',
      })
    }
    else {
      toast.add({
        title: t('projects.connection.validate.failureTitle'),
        description: t(`projects.connection.validate.reasons.${result.reason}`),
        color: 'error',
      })
    }
  }
  catch (err) {
    toast.add({
      title: t('projects.connection.toast.error.title'),
      description: err instanceof Error ? err.message : undefined,
      color: 'error',
    })
  }
}

const revokeOpen = ref(false)
const purgeData = ref(false)
const handleRevoke = async () => {
  try {
    await revokeMutation.mutateAsync({ purgeData: purgeData.value })
    toast.add({
      title: t('projects.connection.toast.revoked.title'),
      color: 'success',
    })
    revokeOpen.value = false
    purgeData.value = false
  }
  catch (err) {
    toast.add({
      title: t('projects.connection.toast.error.title'),
      description: err instanceof Error ? err.message : undefined,
      color: 'error',
    })
  }
}

const formatTimestamp = (iso: string | null | undefined): string => {
  if (!iso)
    return t('projects.connection.status.never')
  const d = new Date(iso)
  if (Number.isNaN(d.getTime()))
    return t('projects.connection.status.never')
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(d)
}

const scopesLabel = computed(() => {
  const scopes = status.value?.scopes ?? []
  if (scopes.length === 0)
    return t('projects.connection.status.scopesEmpty')
  return scopes.join(', ')
})
</script>

<template>
  <div class="p-4 md:p-6 space-y-6 max-w-3xl">
    <UButton
      variant="ghost"
      icon="i-lucide-chevron-left"
      :label="t('projects.connection.back')"
      to="/app/projects"
      class="-ml-2"
    />

    <header>
      <h1 class="text-2xl font-bold text-highlighted">
        {{ t('projects.connection.title') }}
      </h1>
      <p class="text-muted text-sm mt-1">
        {{ t('projects.connection.subtitle') }}
      </p>
    </header>

    <UAlert
      v-if="!canManage"
      color="warning"
      variant="soft"
      icon="i-lucide-shield-alert"
      :title="t('projects.permissions.denied.title')"
      :description="t('projects.permissions.manage.tooltip')"
    />

    <UAlert
      v-if="error"
      color="error"
      variant="soft"
      icon="i-lucide-alert-circle"
      :title="t('projects.errors.load.title')"
      :description="error.message"
    />

    <div v-if="isLoading && !status" class="space-y-3">
      <USkeleton class="h-32 w-full" />
      <USkeleton class="h-32 w-full" />
    </div>

    <template v-else>
      <!-- Status -->
      <UCard>
        <template #header>
          <h2 class="text-lg font-semibold text-highlighted">
            {{ t('projects.connection.status.title') }}
          </h2>
        </template>

        <div class="flex flex-col gap-3 text-sm">
          <div class="flex items-center gap-2">
            <UBadge
              :color="isConnected ? 'success' : 'neutral'"
              variant="subtle"
            >
              {{ isConnected
                ? t('projects.connection.status.connected')
                : t('projects.connection.status.notConnected') }}
            </UBadge>
          </div>
          <template v-if="isConnected">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <span class="text-muted">{{ t('projects.connection.status.ghUserLogin') }}:</span>
                <span class="ml-2 font-medium text-highlighted">{{ status?.ghUserLogin }}</span>
              </div>
              <div>
                <span class="text-muted">{{ t('projects.connection.status.lastValidatedAt') }}:</span>
                <span class="ml-2">{{ formatTimestamp(status?.lastValidatedAt) }}</span>
              </div>
              <div class="sm:col-span-2">
                <span class="text-muted">{{ t('projects.connection.status.scopes') }}:</span>
                <span class="ml-2 font-mono text-xs">{{ scopesLabel }}</span>
              </div>
            </div>
          </template>
        </div>

        <template v-if="canManage && isConnected" #footer>
          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-shield-check"
              :label="t('projects.connection.validate.label')"
              :loading="validateMutation.asyncStatus.value === 'loading'"
              @click="handleValidate"
            />
          </div>
        </template>
      </UCard>

      <!-- Token form -->
      <UCard>
        <template #header>
          <div>
            <h2 class="text-lg font-semibold text-highlighted">
              {{ t('projects.connection.form.title') }}
            </h2>
            <p class="text-sm text-muted">
              {{ t('projects.connection.form.subtitle') }}
            </p>
          </div>
        </template>

        <UFormField :label="t('projects.connection.form.tokenLabel')" :description="t('projects.connection.form.tokenHelp')">
          <UInput
            v-model="tokenInput"
            type="password"
            autocomplete="off"
            :placeholder="t('projects.connection.form.tokenPlaceholder')"
            :disabled="!canManage"
          />
        </UFormField>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              color="primary"
              :label="isConnected
                ? t('projects.connection.form.replace')
                : t('projects.connection.form.save')"
              :loading="connectMutation.asyncStatus.value === 'loading'"
              :disabled="!canManage || !tokenInput.trim()"
              @click="handleSave"
            />
          </div>
        </template>
      </UCard>

      <!-- Revoke -->
      <UCard v-if="isConnected && canManage">
        <template #header>
          <div>
            <h2 class="text-lg font-semibold text-highlighted">
              {{ t('projects.connection.revoke.title') }}
            </h2>
            <p class="text-sm text-muted">
              {{ t('projects.connection.revoke.subtitle') }}
            </p>
          </div>
        </template>

        <UCheckbox
          v-model="purgeData"
          :label="t('projects.connection.revoke.purgeLabel')"
        />

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              color="error"
              variant="outline"
              icon="i-lucide-unplug"
              :label="t('projects.connection.revoke.action')"
              @click="revokeOpen = true"
            />
          </div>
        </template>
      </UCard>
    </template>

    <UModal v-model:open="revokeOpen" :title="t('projects.connection.revoke.confirmTitle')">
      <template #body>
        <p class="text-sm">
          {{ t('projects.connection.revoke.confirmBody', {
            purge: purgeData
              ? t('projects.connection.revoke.confirmBodyPurge')
              : t('projects.connection.revoke.confirmBodyKeep'),
          }) }}
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :label="t('common.cancel')"
            @click="revokeOpen = false"
          />
          <UButton
            color="error"
            :label="t('projects.connection.revoke.confirm')"
            :loading="revokeMutation.asyncStatus.value === 'loading'"
            @click="handleRevoke"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
