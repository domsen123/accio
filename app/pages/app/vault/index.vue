<script setup lang="ts">
/**
 * Vault landing page (T-V-24, REQ-VAULT-7, REQ-VAULT-9, REQ-VAULT-10,
 * REQ-VAULT-11). Folder tree on the left, entry list on the right with
 * search + tag chips. Empty state links to setup or new entry.
 */
import {
  useVaultEntriesList,
  useVaultTags,
} from '~/features/vault/composables/useVaultEntries'
import { useVaultStatus } from '~/features/vault/composables/useVaultStatus'

definePageMeta({
  layout: 'app',
  auth: true,
})

const { t } = useI18n()

const status = useVaultStatus()

const selectedFolderId = ref<string | null>(null)
const selectedTagId = ref<string | null>(null)
const searchQuery = ref('')

const entriesParams = computed(() => ({
  folderId: selectedFolderId.value ?? undefined,
  rootOnly: selectedFolderId.value === null ? true : undefined,
  tagId: selectedTagId.value ?? undefined,
  q: searchQuery.value.trim() || undefined,
}))
const entries = useVaultEntriesList(() => entriesParams.value)
const tags = useVaultTags()

const isUnlocked = computed(() => status.data.value?.isUnlocked ?? false)
const isSetup = computed(() => status.data.value?.isSetup ?? false)

const showEmptyState = computed(() =>
  isUnlocked.value && !entries.isLoading.value && (entries.data.value?.data.length ?? 0) === 0,
)
</script>

<template>
  <div class="flex flex-col h-full">
    <UDashboardToolbar>
      <template #left>
        <h1 class="text-base font-semibold">
          {{ t('vault.page.title') }}
        </h1>
      </template>

      <template #right>
        <UInput
          v-model="searchQuery"
          icon="i-lucide-search"
          color="neutral"
          variant="outline"
          :placeholder="t('vault.page.search')"
          size="sm"
          class="w-56"
          :disabled="!isUnlocked"
        />
        <UButton
          icon="i-lucide-plus"
          color="primary"
          size="sm"
          to="/app/vault/entries/new"
          :label="t('vault.page.newEntry')"
          :disabled="!isUnlocked"
        />
      </template>
    </UDashboardToolbar>

    <div v-if="!isSetup" class="flex flex-col items-center justify-center flex-1 gap-4 p-8 text-center">
      <UIcon name="i-lucide-shield-off" class="size-12 text-muted" />
      <div>
        <h2 class="text-base font-semibold text-highlighted">
          {{ t('vault.page.emptyState.title') }}
        </h2>
        <p class="text-sm text-muted mt-1">
          {{ t('vault.page.emptyState.setupNeeded') }}
        </p>
      </div>
      <UButton
        color="primary"
        icon="i-lucide-key"
        to="/app/vault/settings"
        :label="t('vault.page.emptyState.setupAction')"
      />
    </div>

    <div v-else-if="!isUnlocked" class="flex flex-col items-center justify-center flex-1 gap-4 p-8 text-center">
      <UIcon name="i-lucide-lock" class="size-12 text-muted" />
      <div>
        <h2 class="text-base font-semibold text-highlighted">
          {{ t('vault.lockIndicator.statusLocked') }}
        </h2>
        <p class="text-sm text-muted mt-1">
          {{ t('vault.lockIndicator.lockedHint') }}
        </p>
      </div>
      <UButton
        color="primary"
        icon="i-lucide-key"
        :label="t('vault.lockIndicator.unlock')"
        @click="useVaultUnlockDialog().open()"
      />
    </div>

    <div v-else class="flex-1 grid grid-cols-12 gap-0 overflow-hidden">
      <aside class="col-span-3 border-r border-default p-3 overflow-auto">
        <h2 class="text-xs uppercase tracking-wide text-muted mb-2">
          {{ t('vault.page.folders') }}
        </h2>
        <VaultFolderTree
          :selected-id="selectedFolderId"
          @select="(id) => (selectedFolderId = id)"
        />

        <h2 class="text-xs uppercase tracking-wide text-muted mt-6 mb-2">
          {{ t('vault.page.tags') }}
        </h2>
        <div class="flex flex-wrap gap-1">
          <UButton
            v-for="tag in tags.data.value?.data ?? []"
            :key="tag.id"
            :color="selectedTagId === tag.id ? 'primary' : 'neutral'"
            :variant="selectedTagId === tag.id ? 'solid' : 'soft'"
            size="xs"
            :label="tag.name"
            @click="selectedTagId = selectedTagId === tag.id ? null : tag.id"
          />
        </div>

        <NuxtLink
          to="/app/vault/trash"
          class="mt-6 block text-xs text-muted hover:text-default"
        >
          <UIcon name="i-lucide-trash-2" class="size-3 mr-1" />
          {{ t('vault.page.trash') }}
        </NuxtLink>
      </aside>

      <section class="col-span-9 overflow-auto">
        <div v-if="showEmptyState" class="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
          <UIcon name="i-lucide-inbox" class="size-10 text-muted" />
          <p class="text-sm text-muted">
            {{ t('vault.page.emptyState.description') }}
          </p>
          <UButton
            color="primary"
            icon="i-lucide-plus"
            size="sm"
            to="/app/vault/entries/new"
            :label="t('vault.page.emptyState.create')"
          />
        </div>

        <ul v-else class="divide-y divide-default">
          <li
            v-for="entry in entries.data.value?.data ?? []"
            :key="entry.id"
            class="px-4 py-3 hover:bg-muted cursor-pointer flex items-center gap-3"
            @click="$router.push(`/app/vault/entries/${entry.id}`)"
          >
            <UIcon name="i-lucide-key-round" class="size-4 text-muted" />
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-highlighted truncate">
                {{ entry.title }}
              </p>
              <p class="text-xs text-muted">
                {{ new Date(entry.updatedAt).toLocaleDateString() }}
              </p>
            </div>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
