<script setup lang="ts">
/**
 * Top-nav vault lock indicator (T-V-23, REQ-VAULT-4, DESIGN-VAULT-FRONTEND).
 *
 * Renders an open/closed padlock with a popover offering "Lock now",
 * a remaining-time countdown, and a link to /app/vault/settings. Visible
 * only when the user has `vault:read` for the active workspace; the
 * parent layout decides when to render this component.
 *
 * The indicator polls `useVaultStatus` and shows a coarse minute-level
 * countdown derived from `locksAt`. We deliberately avoid a per-second
 * re-render — the user experience doesn't need it and a heartbeat timer
 * would burn CPU in idle tabs.
 */
import { useVaultLock, useVaultStatus } from '../composables/useVaultStatus'
import { useVaultUnlockDialog } from '../composables/useVaultUnlockDialog'

const { t } = useI18n()
const status = useVaultStatus()
const lock = useVaultLock()
const dialog = useVaultUnlockDialog()

// Re-derive the countdown every 30s to match the status query cadence.
const tick = ref(0)
let interval: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  interval = setInterval(() => {
    tick.value += 1
  }, 30_000)
})
onUnmounted(() => {
  if (interval !== null)
    clearInterval(interval)
})

const isUnlocked = computed(() => status.data.value?.isUnlocked ?? false)
const isSetup = computed(() => status.data.value?.isSetup ?? false)

const remainingMinutes = computed(() => {
  // touch `tick` so the computed re-runs on the interval
  void tick.value
  const locksAt = status.data.value?.locksAt
  if (!locksAt)
    return null
  const ms = new Date(locksAt).getTime() - Date.now()
  if (ms <= 0)
    return 0
  return Math.max(1, Math.round(ms / 60_000))
})

const iconName = computed(() =>
  isUnlocked.value ? 'i-lucide-lock-open' : 'i-lucide-lock',
)

const tooltipLabel = computed(() => {
  if (!isSetup.value)
    return t('vault.lockIndicator.tooltipNotSetUp')
  if (!isUnlocked.value)
    return t('vault.lockIndicator.tooltipLocked')
  if (remainingMinutes.value === null)
    return t('vault.lockIndicator.tooltipUnlocked')
  return t('vault.lockIndicator.tooltipUnlockedWithMinutes', { minutes: remainingMinutes.value })
})

const onLock = async () => {
  try {
    await lock.mutateAsync()
  }
  catch {
    // Lock is idempotent — surface no error.
  }
}

const onUnlock = () => {
  dialog.open()
}
</script>

<template>
  <UPopover :ui="{ content: 'w-72' }">
    <UButton
      :icon="iconName"
      color="neutral"
      variant="ghost"
      :aria-label="tooltipLabel"
      :title="tooltipLabel"
      :disabled="status.isLoading.value"
    />

    <template #content>
      <div class="p-3 space-y-3">
        <div class="flex items-center gap-2">
          <UIcon
            :name="iconName"
            class="size-5"
            :class="isUnlocked ? 'text-success' : 'text-muted'"
          />
          <h3 class="text-sm font-semibold text-highlighted">
            {{ isUnlocked ? t('vault.lockIndicator.statusUnlocked') : t('vault.lockIndicator.statusLocked') }}
          </h3>
        </div>

        <p v-if="!isSetup" class="text-xs text-muted">
          {{ t('vault.lockIndicator.notSetUpHint') }}
        </p>

        <p v-else-if="isUnlocked && remainingMinutes !== null" class="text-xs text-muted">
          {{ t('vault.lockIndicator.autoLockIn', { minutes: remainingMinutes }) }}
        </p>

        <p v-else-if="!isUnlocked" class="text-xs text-muted">
          {{ t('vault.lockIndicator.lockedHint') }}
        </p>

        <div class="flex flex-col gap-2 pt-1">
          <UButton
            v-if="isUnlocked"
            color="neutral"
            variant="soft"
            size="sm"
            block
            icon="i-lucide-lock"
            :loading="lock.isLoading.value"
            :label="t('vault.lockIndicator.lockNow')"
            @click="onLock"
          />
          <UButton
            v-else-if="isSetup"
            color="primary"
            variant="solid"
            size="sm"
            block
            icon="i-lucide-key"
            :label="t('vault.lockIndicator.unlock')"
            @click="onUnlock"
          />
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            block
            icon="i-lucide-settings"
            to="/app/vault/settings"
            :label="t('vault.lockIndicator.settingsLink')"
          />
        </div>
      </div>
    </template>
  </UPopover>
</template>
