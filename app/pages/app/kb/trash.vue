<script setup lang="ts">
/**
 * KB Trash page (T-1.10) — `/app/kb/trash`.
 *
 * Lists soft-deleted entries (REQ-KB-9, ADR-009). Per-row actions:
 *   - Restore   → POST /api/kb/entries/[id]/restore
 *   - Purge     → DELETE /api/kb/entries/[id]/purge (two-step confirm)
 *
 * "Endgültig löschen" / "Permanently delete" is irreversible — the modal
 * states this explicitly and uses a destructive-color CTA. Type-to-confirm
 * is overkill for a single-user hub; a simple modal confirmation suffices
 * (the entry is already in trash; the user has triaged once).
 */
import type { KbEntry, KbPaginatedListParams } from '~/features/kb/types/kb.types'
import KbSubNav from '~/features/kb/components/KbSubNav.vue'
import {
  usePurgeKbEntry,
  useRestoreKbEntry,
} from '~/features/kb/composables/useKbEntryMutations'
import { useKbTrash } from '~/features/kb/composables/useKbTrash'

definePageMeta({
  layout: 'app',
  auth: true,
})

const { t, locale } = useI18n()
const toast = useToast()

useSeoMeta({
  title: () => t('kb.trash.title'),
})

// === Pagination state ===
const page = useRouteQuery('page', '1', { transform: Number })
const perPage = 20

const queryParams = computed<KbPaginatedListParams>(() => ({
  limit: perPage,
  offset: (page.value - 1) * perPage,
}))

const { entries, isLoading, error } = useKbTrash(queryParams)

const hasNextPage = computed(() => entries.value.length === perPage)
const hasPrevPage = computed(() => page.value > 1)

// === Mutations ===
const restoreMutation = useRestoreKbEntry()
const purgeMutation = usePurgeKbEntry()

const pendingId = ref<string | null>(null)
const pendingAction = ref<'restore' | 'purge' | null>(null)

const isPending = (id: string, action: typeof pendingAction.value): boolean =>
  pendingId.value === id && pendingAction.value === action

const isRowBusy = (id: string): boolean => pendingId.value === id

const onRestore = async (entry: KbEntry) => {
  pendingId.value = entry.id
  pendingAction.value = 'restore'
  try {
    await restoreMutation.mutateAsync(entry.id)
    toast.add({
      title: t('kb.trash.actions.restore.toast.success'),
      color: 'success',
    })
  }
  catch {
    toast.add({
      title: t('kb.trash.actions.restore.toast.error'),
      color: 'error',
    })
  }
  finally {
    pendingId.value = null
    pendingAction.value = null
  }
}

// === Purge confirmation modal ===
const purgeTarget = ref<KbEntry | null>(null)
const isPurgeModalOpen = ref(false)

const askPurge = (entry: KbEntry) => {
  purgeTarget.value = entry
  isPurgeModalOpen.value = true
}

const cancelPurge = () => {
  isPurgeModalOpen.value = false
  purgeTarget.value = null
}

const confirmPurge = async () => {
  const target = purgeTarget.value
  if (!target)
    return
  pendingId.value = target.id
  pendingAction.value = 'purge'
  try {
    await purgeMutation.mutateAsync(target.id)
    toast.add({
      title: t('kb.trash.actions.purge.toast.success'),
      color: 'success',
    })
    isPurgeModalOpen.value = false
    purgeTarget.value = null
  }
  catch {
    toast.add({
      title: t('kb.trash.actions.purge.toast.error'),
      color: 'error',
    })
  }
  finally {
    pendingId.value = null
    pendingAction.value = null
  }
}

// === Formatters ===
const formatRelative = (iso: string | null): string => {
  if (!iso)
    return ''
  const target = new Date(iso).getTime()
  if (Number.isNaN(target))
    return ''
  const diffMs = target - Date.now()
  const diffSec = Math.round(diffMs / 1000)
  const rtf = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' })
  const abs = Math.abs(diffSec)
  if (abs < 60)
    return rtf.format(diffSec, 'second')
  if (abs < 3600)
    return rtf.format(Math.round(diffSec / 60), 'minute')
  if (abs < 86_400)
    return rtf.format(Math.round(diffSec / 3600), 'hour')
  if (abs < 2_592_000)
    return rtf.format(Math.round(diffSec / 86_400), 'day')
  if (abs < 31_104_000)
    return rtf.format(Math.round(diffSec / 2_592_000), 'month')
  return rtf.format(Math.round(diffSec / 31_104_000), 'year')
}

const detailHref = (entry: KbEntry) => `/app/kb/${encodeURIComponent(entry.slug)}`
</script>

<template>
  <div class="p-4 md:p-6 space-y-6">
    <!-- Header -->
    <div class="space-y-1">
      <h1 class="text-2xl font-bold text-highlighted">
        {{ t('kb.trash.title') }}
      </h1>
      <p class="text-muted text-sm">
        {{ t('kb.trash.subtitle') }}
      </p>
      <UAlert
        color="warning"
        variant="subtle"
        icon="i-lucide-alert-triangle"
        :description="t('kb.trash.warning')"
        class="mt-3"
      />
    </div>

    <!-- Sub-navigation between All / Inbox / Trash -->
    <KbSubNav />

    <!-- Error -->
    <UAlert
      v-if="error"
      color="error"
      variant="soft"
      :title="t('kb.trash.error.title')"
      :description="error.message"
      icon="i-lucide-alert-circle"
    />

    <!-- Loading skeleton -->
    <div v-if="isLoading" class="space-y-3">
      <USkeleton v-for="i in 3" :key="i" class="h-24 w-full" />
    </div>

    <!-- Empty state -->
    <UCard
      v-else-if="entries.length === 0"
      :ui="{ body: 'flex flex-col items-center text-center py-12 gap-2' }"
    >
      <UIcon name="i-lucide-trash" class="size-10 text-muted" />
      <h3 class="text-lg font-semibold text-highlighted">
        {{ t('kb.trash.empty.title') }}
      </h3>
      <p class="text-sm text-muted max-w-md">
        {{ t('kb.trash.empty.subtitle') }}
      </p>
    </UCard>

    <!-- Result list -->
    <div v-else class="space-y-2">
      <UCard
        v-for="entry in entries"
        :key="entry.id"
        :ui="{ body: 'p-4' }"
      >
        <div class="flex items-start justify-between gap-4 flex-wrap">
          <div class="min-w-0 flex-1 space-y-1">
            <div class="flex items-center gap-2 flex-wrap">
              <NuxtLink
                :to="detailHref(entry)"
                class="text-base font-semibold text-highlighted truncate hover:underline"
              >
                {{ entry.title }}
              </NuxtLink>
              <UBadge variant="subtle" color="neutral" size="xs">
                {{ t(`kb.status.${entry.status}`) }}
              </UBadge>
            </div>
            <p class="text-xs text-muted truncate">
              {{ entry.slug }}
            </p>
            <p class="text-xs text-muted font-mono">
              {{ t('kb.trash.deletedAt', { when: formatRelative(entry.deletedAt) }) }}
            </p>
          </div>

          <!-- Action buttons (per-row) -->
          <div class="flex items-center gap-2 shrink-0 flex-wrap">
            <UButton
              size="sm"
              color="primary"
              icon="i-lucide-rotate-ccw"
              :label="t('kb.actions.restore')"
              :loading="isPending(entry.id, 'restore')"
              :disabled="isRowBusy(entry.id)"
              @click="onRestore(entry)"
            />
            <UButton
              size="sm"
              variant="outline"
              color="error"
              icon="i-lucide-trash-2"
              :label="t('kb.actions.purge')"
              :loading="isPending(entry.id, 'purge')"
              :disabled="isRowBusy(entry.id)"
              @click="askPurge(entry)"
            />
          </div>
        </div>
      </UCard>
    </div>

    <!-- Pagination -->
    <div
      v-if="entries.length > 0 && (hasPrevPage || hasNextPage)"
      class="flex items-center justify-end gap-2"
    >
      <UButton
        variant="outline"
        color="neutral"
        icon="i-lucide-chevron-left"
        :label="t('kb.list.pagination.prev')"
        :disabled="!hasPrevPage"
        @click="page = Math.max(1, page - 1)"
      />
      <span class="text-sm text-muted">
        {{ t('kb.list.pagination.page', { page }) }}
      </span>
      <UButton
        variant="outline"
        color="neutral"
        trailing-icon="i-lucide-chevron-right"
        :label="t('kb.list.pagination.next')"
        :disabled="!hasNextPage"
        @click="page = page + 1"
      />
    </div>

    <!-- Purge confirmation modal -->
    <UModal v-model:open="isPurgeModalOpen">
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center gap-3">
              <div class="flex items-center justify-center size-10 rounded-lg bg-error/10">
                <UIcon name="i-lucide-alert-triangle" class="size-5 text-error" />
              </div>
              <div>
                <h3 class="text-base font-semibold text-highlighted">
                  {{ t('kb.confirm.purge.title') }}
                </h3>
                <p class="text-sm text-muted">
                  {{ purgeTarget?.title }}
                </p>
              </div>
            </div>
          </template>

          <p class="text-sm text-default">
            {{ t('kb.confirm.purge.body') }}
          </p>

          <div class="flex items-center justify-end gap-3 pt-4">
            <UButton
              variant="ghost"
              color="neutral"
              :disabled="pendingAction === 'purge'"
              @click="cancelPurge"
            >
              {{ t('kb.confirm.purge.cancel') }}
            </UButton>
            <UButton
              color="error"
              :loading="pendingAction === 'purge'"
              @click="confirmPurge"
            >
              {{ t('kb.confirm.purge.cta') }}
            </UButton>
          </div>
        </UCard>
      </template>
    </UModal>
  </div>
</template>
