<script setup lang="ts">
/**
 * Vault Trash view (T-V-28, REQ-VAULT-8). Lists soft-deleted entries
 * with restore + purge actions per row.
 */
import {
  usePurgeVaultEntry,
  useRestoreVaultEntry,
  useVaultTrash,
} from '~/features/vault/composables/useVaultEntries'

definePageMeta({ layout: 'app', auth: true })
const { t } = useI18n()
const trash = useVaultTrash()
const restore = useRestoreVaultEntry()
const purge = usePurgeVaultEntry()

const purgeOpen = ref<string | null>(null)
const onPurge = async () => {
  const id = purgeOpen.value
  if (!id)
    return
  await purge.mutateAsync(id)
  purgeOpen.value = null
}
</script>

<template>
  <div>
    <UDashboardToolbar>
      <template #left>
        <h1 class="text-base font-semibold">
          {{ t('vault.trash.pageTitle') }}
        </h1>
      </template>
    </UDashboardToolbar>

    <div class="p-6 max-w-3xl mx-auto">
      <div v-if="trash.isLoading.value" class="text-sm text-muted">
        {{ t('common.loading') }}
      </div>
      <p v-else-if="(trash.data.value?.data.length ?? 0) === 0" class="text-sm text-muted">
        {{ t('vault.trash.empty') }}
      </p>
      <ul v-else class="divide-y divide-default border border-default rounded">
        <li
          v-for="entry in trash.data.value?.data ?? []"
          :key="entry.id"
          class="flex items-center gap-3 px-3 py-2"
        >
          <UIcon name="i-lucide-key-round" class="size-4 text-muted" />
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-highlighted truncate">
              {{ entry.title }}
            </p>
            <p class="text-xs text-muted">
              {{ entry.deletedAt ? new Date(entry.deletedAt).toLocaleString() : '' }}
            </p>
          </div>
          <UButton
            color="primary"
            variant="ghost"
            size="xs"
            icon="i-lucide-undo-2"
            :label="t('vault.trash.restore')"
            :loading="restore.isLoading.value"
            @click="restore.mutateAsync(entry.id)"
          />
          <UButton
            color="error"
            variant="ghost"
            size="xs"
            icon="i-lucide-trash-2"
            :label="t('vault.trash.purgeAction')"
            @click="purgeOpen = entry.id"
          />
        </li>
      </ul>

      <UModal
        :open="purgeOpen !== null"
        :title="t('vault.trash.purgeConfirmTitle')"
        @update:open="(v: boolean) => v ? null : (purgeOpen = null)"
      >
        <template #body>
          <div class="light space-y-3">
            <p class="text-sm text-default">
              {{ t('vault.trash.purgeConfirmDescription') }}
            </p>
            <div class="flex justify-end gap-2 pt-2">
              <UButton
                color="neutral"
                variant="ghost"
                :label="t('vault.trash.purgeCancel')"
                @click="purgeOpen = null"
              />
              <UButton
                color="error"
                :label="t('vault.trash.purgeSubmit')"
                :loading="purge.isLoading.value"
                @click="onPurge"
              />
            </div>
          </div>
        </template>
      </UModal>
    </div>
  </div>
</template>
