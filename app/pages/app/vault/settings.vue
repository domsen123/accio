<script setup lang="ts">
/**
 * Vault settings page (T-V-30, REQ-VAULT-5, REQ-VAULT-6).
 *
 * Two surfaces in one page:
 *   1. Change master password — validates current vs new (server-side)
 *      and re-wraps every workspace DEK. All sessions invalidated on
 *      success; user must re-unlock.
 *   2. Reset vault — destructive irreversible action. Wrapped in a
 *      `light` div per DESIGN.md and gated by typing "RESET" exactly.
 *
 * If the user hasn't set up a master password yet, the page surfaces
 * the setup form (referenced by `T-V-7`'s endpoint) so the same route
 * covers both first-time setup and ongoing maintenance.
 */
import { useMutation, useQueryCache } from '@pinia/colada'
import { useVaultApi } from '~/features/vault/api/vault.api'
import { useVaultStatus } from '~/features/vault/composables/useVaultStatus'

definePageMeta({ layout: 'app', auth: true })

const { t } = useI18n()
const toast = useToast()
const api = useVaultApi()
const queryCache = useQueryCache()
const status = useVaultStatus()

const isSetup = computed(() => status.data.value?.isSetup ?? false)

// ── First-time setup ─────────────────────────────────────────────────
const setupCurrent = ref('')
const setupConfirm = ref('')
const setupAck = ref(false)
const setupError = ref<string | null>(null)
const setup = useMutation({
  mutation: (body: { masterPassword: string, acknowledgeIrrecoverable: true }) => api.setup(body),
  onSuccess: () => queryCache.invalidateQueries({ key: ['vault', 'status'] }),
})
const onSetup = async () => {
  setupError.value = null
  if (setupCurrent.value.trim().length < 12) {
    setupError.value = 'vault.setup.minLength'
    return
  }
  if (setupCurrent.value !== setupConfirm.value) {
    setupError.value = 'vault.setup.mismatch'
    return
  }
  if (!setupAck.value) {
    setupError.value = 'vault.setup.acknowledgeIrrecoverable'
    return
  }
  try {
    await setup.mutateAsync({
      masterPassword: setupCurrent.value,
      acknowledgeIrrecoverable: true,
    })
    setupCurrent.value = ''
    setupConfirm.value = ''
    setupAck.value = false
    toast.add({ title: t('vault.setup.title'), color: 'success' })
  }
  catch (err) {
    setupError.value = (err as { data?: { statusMessage?: string } }).data?.statusMessage ?? 'vault.setup.errorAlreadyConfigured'
  }
}

// ── Change master ────────────────────────────────────────────────────
const cmCurrent = ref('')
const cmNew = ref('')
const cmNewConfirm = ref('')
const cmError = ref<string | null>(null)
const change = useMutation({
  mutation: (body: { currentPassword: string, newPassword: string }) => api.changeMaster(body),
  onSuccess: () => queryCache.invalidateQueries({ key: ['vault'] }),
})
const onChange = async () => {
  cmError.value = null
  if (cmNew.value.trim().length < 12) {
    cmError.value = 'vault.setup.minLength'
    return
  }
  if (cmNew.value !== cmNewConfirm.value) {
    cmError.value = 'vault.settings.changeMaster.errorMismatch'
    return
  }
  if (cmCurrent.value === cmNew.value) {
    cmError.value = 'vault.settings.changeMaster.errorUnchanged'
    return
  }
  try {
    await change.mutateAsync({ currentPassword: cmCurrent.value, newPassword: cmNew.value })
    cmCurrent.value = ''
    cmNew.value = ''
    cmNewConfirm.value = ''
    toast.add({ title: t('vault.settings.changeMaster.successToast'), color: 'success' })
  }
  catch (err) {
    cmError.value = (err as { data?: { statusMessage?: string } }).data?.statusMessage
      ?? 'vault.settings.changeMaster.errorInvalidCurrent'
  }
}

// ── Reset vault ──────────────────────────────────────────────────────
const resetOpen = ref(false)
const resetConfirmText = ref('')
const reset = useMutation({
  mutation: () => api.reset(),
  onSuccess: () => queryCache.invalidateQueries({ key: ['vault'] }),
})
const onReset = async () => {
  if (resetConfirmText.value.trim().toUpperCase() !== 'RESET')
    return
  try {
    await reset.mutateAsync()
    toast.add({ title: t('vault.settings.reset.successToast'), color: 'success' })
    resetOpen.value = false
    resetConfirmText.value = ''
  }
  catch {
    toast.add({ title: 'Error', color: 'error' })
  }
}
</script>

<template>
  <div>
    <UDashboardToolbar>
      <template #left>
        <h1 class="text-base font-semibold">
          {{ t('vault.settings.pageTitle') }}
        </h1>
      </template>
    </UDashboardToolbar>

    <div class="p-6 max-w-2xl mx-auto space-y-8">
      <section v-if="!isSetup" class="space-y-3">
        <div class="light bg-elevated border border-default rounded p-4 space-y-3">
          <h2 class="text-base font-semibold text-highlighted">
            {{ t('vault.setup.title') }}
          </h2>
          <p class="text-sm text-muted">
            {{ t('vault.setup.description') }}
          </p>
          <UAlert
            v-if="setupError"
            color="error"
            variant="soft"
            :title="t(`${setupError}`)"
          />
          <UFormField :label="t('vault.setup.masterPasswordLabel')" required>
            <UInput v-model="setupCurrent" type="password" autocomplete="new-password" :placeholder="t('vault.setup.masterPasswordPlaceholder')" size="lg" />
          </UFormField>
          <UFormField :label="t('vault.setup.masterPasswordConfirmLabel')" required>
            <UInput v-model="setupConfirm" type="password" autocomplete="new-password" size="lg" />
          </UFormField>
          <UCheckbox v-model="setupAck" :label="t('vault.setup.acknowledgeIrrecoverable')" />
          <div class="flex justify-end gap-2">
            <UButton
              color="primary"
              :label="t('vault.setup.submit')"
              :loading="setup.isLoading.value"
              @click="onSetup"
            />
          </div>
        </div>
      </section>

      <section v-else class="space-y-6">
        <div class="space-y-3">
          <h2 class="text-base font-semibold text-highlighted">
            {{ t('vault.settings.changeMaster.heading') }}
          </h2>
          <p class="text-sm text-muted">
            {{ t('vault.settings.changeMaster.description') }}
          </p>
          <UAlert
            v-if="cmError"
            color="error"
            variant="soft"
            :title="t(`${cmError}`)"
          />
          <UFormField :label="t('vault.settings.changeMaster.currentPasswordLabel')" required>
            <UInput v-model="cmCurrent" type="password" autocomplete="current-password" />
          </UFormField>
          <UFormField :label="t('vault.settings.changeMaster.newPasswordLabel')" required>
            <UInput v-model="cmNew" type="password" autocomplete="new-password" />
          </UFormField>
          <UFormField :label="t('vault.settings.changeMaster.confirmNewPasswordLabel')" required>
            <UInput v-model="cmNewConfirm" type="password" autocomplete="new-password" />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton
              color="primary"
              :label="t('vault.settings.changeMaster.submit')"
              :loading="change.isLoading.value"
              @click="onChange"
            />
          </div>
        </div>

        <div class="border-t border-default pt-6 space-y-3">
          <h2 class="text-base font-semibold text-error">
            {{ t('vault.settings.reset.heading') }}
          </h2>
          <p class="text-sm text-muted">
            {{ t('vault.settings.reset.description') }}
          </p>
          <UButton
            color="error"
            variant="soft"
            icon="i-lucide-skull"
            :label="t('vault.settings.reset.trigger')"
            @click="resetOpen = true"
          />
        </div>
      </section>
    </div>

    <UModal
      :open="resetOpen"
      :title="t('vault.settings.reset.confirmTitle')"
      @update:open="(v: boolean) => v ? null : (resetOpen = false)"
    >
      <template #body>
        <div class="light space-y-3">
          <UAlert
            color="error"
            variant="soft"
            icon="i-lucide-alert-triangle"
            :title="t('vault.settings.reset.confirmTitle')"
            :description="t('vault.settings.reset.confirmDescription')"
          />
          <UFormField :label="t('vault.settings.reset.confirmInputLabel')">
            <UInput v-model="resetConfirmText" placeholder="RESET" autocomplete="off" />
          </UFormField>
          <div class="flex justify-end gap-2 pt-2">
            <UButton
              color="neutral"
              variant="ghost"
              :label="t('vault.settings.reset.cancel')"
              @click="resetOpen = false; resetConfirmText = ''"
            />
            <UButton
              color="error"
              :label="t('vault.settings.reset.submit')"
              :loading="reset.isLoading.value"
              :disabled="resetConfirmText.trim().toUpperCase() !== 'RESET'"
              @click="onReset"
            />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
