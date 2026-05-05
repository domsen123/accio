<script setup lang="ts">
/**
 * Global vault unlock modal (T-V-23, REQ-VAULT-3).
 *
 * Visibility is driven by `useVaultUnlockDialog` so any feature can pop
 * the dialog (e.g. an HTTP 423 interceptor in T-V-26 wires through the
 * fetch error handler later). Per DESIGN.md, modals wrap content in a
 * `light` div so they stay readable in dark mode.
 *
 * The dialog calls `/api/vault/unlock` directly via the unlock mutation;
 * on success the vault status query is invalidated, which propagates to
 * the lock indicator + any vault page guards.
 */
import { useVaultUnlock } from '../composables/useVaultStatus'
import { useVaultUnlockDialog } from '../composables/useVaultUnlockDialog'

const { t } = useI18n()
const { isOpen, close } = useVaultUnlockDialog()
const masterPassword = ref('')
const error = ref<string | null>(null)

const unlock = useVaultUnlock()

const onSubmit = async () => {
  error.value = null
  try {
    await unlock.mutateAsync({ masterPassword: masterPassword.value })
    masterPassword.value = ''
    close()
  }
  catch (err) {
    const code = (err as { data?: { statusMessage?: string }, statusMessage?: string }).data?.statusMessage
      ?? (err as { statusMessage?: string }).statusMessage
      ?? 'vault.unlock.error_generic'
    error.value = code
  }
}

const onCancel = () => {
  masterPassword.value = ''
  error.value = null
  close()
}
</script>

<template>
  <UModal
    :open="isOpen"
    :title="t('vault.unlock.title')"
    @update:open="(v: boolean) => (v ? null : onCancel())"
  >
    <template #body>
      <div class="light">
        <form class="space-y-4" @submit.prevent="onSubmit">
          <p class="text-sm text-muted">
            {{ t('vault.unlock.description') }}
          </p>
          <UFormField :label="t('vault.unlock.masterPasswordLabel')" required>
            <UInput
              v-model="masterPassword"
              type="password"
              autocomplete="current-password"
              :placeholder="t('vault.unlock.masterPasswordPlaceholder')"
              size="lg"
              autofocus
            />
          </UFormField>
          <UAlert
            v-if="error"
            color="error"
            variant="soft"
            :title="t(`${error}`)"
          />
          <p class="text-xs text-muted">
            {{ t('vault.unlock.hint') }}
          </p>
          <div class="flex justify-end gap-2 pt-2">
            <UButton
              type="button"
              color="neutral"
              variant="ghost"
              :label="t('vault.unlock.cancel')"
              :disabled="unlock.isLoading.value"
              @click="onCancel"
            />
            <UButton
              type="submit"
              color="primary"
              :label="t('vault.unlock.submit')"
              :loading="unlock.isLoading.value"
              :disabled="!masterPassword"
            />
          </div>
        </form>
      </div>
    </template>
  </UModal>
</template>
