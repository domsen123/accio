<script setup lang="ts">
/**
 * KB Inbox page (T-1.10) — `/app/kb/inbox`.
 *
 * Lists entries with `status='inbox'` (REQ-KB-8). Per-row one-click actions:
 *   - Verify   → setStatus('verified')
 *   - Draft    → setStatus('draft')
 *   - Archive  → setStatus('archived')
 *   - Delete   → soft-delete (confirmation modal first)
 *
 * Mutations live in `useKbEntryMutations`; on success they invalidate the
 * inbox / list / trash query families so the page updates automatically.
 *
 * No bulk actions — that's T-NTH-2.
 */
import type { BreadcrumbItem } from '@nuxt/ui'
import type { KbEntry, KbPaginatedListParams } from '~/features/kb/types/kb.types'
import KbSubNav from '~/features/kb/components/KbSubNav.vue'
import {
  useArchiveKbEntry,
  useDeleteKbEntry,
  useMarkKbEntryDraft,
  useVerifyKbEntry,
} from '~/features/kb/composables/useKbEntryMutations'
import { useKbInbox } from '~/features/kb/composables/useKbInbox'

definePageMeta({
  layout: 'app',
  auth: true,
})

const { t, locale } = useI18n()
const toast = useToast()

useSeoMeta({
  title: () => t('kb.inbox.title'),
})

// === Pagination state (server has no total; mirror list page's prev/next) ===
const page = useRouteQuery('page', '1', { transform: Number })
const perPage = 20

const queryParams = computed<KbPaginatedListParams>(() => ({
  limit: perPage,
  offset: (page.value - 1) * perPage,
}))

const { entries, isLoading, error } = useKbInbox(queryParams)

const hasNextPage = computed(() => entries.value.length === perPage)
const hasPrevPage = computed(() => page.value > 1)

// === Mutations ===
const verifyMutation = useVerifyKbEntry()
const draftMutation = useMarkKbEntryDraft()
const archiveMutation = useArchiveKbEntry()
const deleteMutation = useDeleteKbEntry()

// Track per-row "in flight" so only the clicked row's buttons disable.
const pendingId = ref<string | null>(null)
const pendingAction = ref<'verify' | 'draft' | 'archive' | 'delete' | null>(null)

const isPending = (id: string, action: typeof pendingAction.value): boolean =>
  pendingId.value === id && pendingAction.value === action

const isRowBusy = (id: string): boolean => pendingId.value === id

const runAction = async (
  entry: KbEntry,
  action: 'verify' | 'draft' | 'archive',
) => {
  pendingId.value = entry.id
  pendingAction.value = action
  try {
    if (action === 'verify')
      await verifyMutation.mutateAsync(entry.id)
    else if (action === 'draft')
      await draftMutation.mutateAsync(entry.id)
    else if (action === 'archive')
      await archiveMutation.mutateAsync(entry.id)
    toast.add({
      title: t(`kb.inbox.actions.${action}.toast.success`),
      color: 'success',
    })
  }
  catch {
    toast.add({
      title: t(`kb.inbox.actions.${action}.toast.error`),
      color: 'error',
    })
  }
  finally {
    pendingId.value = null
    pendingAction.value = null
  }
}

// === Delete confirmation modal ===
const deleteTarget = ref<KbEntry | null>(null)
const isDeleteModalOpen = ref(false)

const askDelete = (entry: KbEntry) => {
  deleteTarget.value = entry
  isDeleteModalOpen.value = true
}

const cancelDelete = () => {
  isDeleteModalOpen.value = false
  deleteTarget.value = null
}

const confirmDelete = async () => {
  const target = deleteTarget.value
  if (!target)
    return
  pendingId.value = target.id
  pendingAction.value = 'delete'
  try {
    await deleteMutation.mutateAsync(target.id)
    toast.add({
      title: t('kb.inbox.actions.delete.toast.success'),
      color: 'success',
    })
    isDeleteModalOpen.value = false
    deleteTarget.value = null
  }
  catch {
    toast.add({
      title: t('kb.inbox.actions.delete.toast.error'),
      color: 'error',
    })
  }
  finally {
    pendingId.value = null
    pendingAction.value = null
  }
}

// === Formatters ===
const formatRelative = (iso: string): string => {
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

const breadcrumbItems = computed<BreadcrumbItem[]>(() => [
  { label: t('kb.list.title'), to: '/app/kb' },
  { label: t('kb.inbox.title') },
])
</script>

<template>
  <UPage>
    <UPageHeader
      :title="t('kb.inbox.title')"
      :description="t('kb.inbox.subtitle')"
      :ui="{ root: 'border-none' }"
    >
      <template #headline>
        <UBreadcrumb :items="breadcrumbItems" />
      </template>
      <div class="mt-4">
        <KbSubNav />
      </div>
    </UPageHeader>

    <UPage>
      <div class="space-y-6">
        <!-- Error -->
        <UAlert
          v-if="error"
          color="error"
          variant="soft"
          :title="t('kb.inbox.error.title')"
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
          <UIcon name="i-lucide-inbox" class="size-10 text-muted" />
          <h3 class="text-lg font-semibold text-highlighted">
            {{ t('kb.inbox.empty.title') }}
          </h3>
          <p class="text-sm text-muted max-w-md">
            {{ t('kb.inbox.empty.subtitle') }}
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
                  <UBadge variant="subtle" color="warning" size="xs">
                    {{ t('kb.status.inbox') }}
                  </UBadge>
                  <UBadge
                    variant="outline"
                    size="xs"
                    :icon="entry.authorType === 'ai' ? 'i-lucide-sparkles' : 'i-lucide-user'"
                  >
                    {{ t(`kb.author.${entry.authorType}`) }}
                  </UBadge>
                  <UBadge
                    variant="outline"
                    size="xs"
                    icon="i-lucide-link"
                  >
                    {{ t(`kb.source.${entry.sourceType}`) }}
                  </UBadge>
                </div>
                <p class="text-xs text-muted truncate">
                  {{ entry.slug }}
                </p>
                <p class="text-xs text-muted font-mono">
                  {{ formatRelative(entry.createdAt) }}
                </p>
              </div>

              <!-- Action buttons (per-row) -->
              <div class="flex items-center gap-2 shrink-0 flex-wrap">
                <UButton
                  size="sm"
                  color="primary"
                  icon="i-lucide-check"
                  :label="t('kb.actions.verify')"
                  :loading="isPending(entry.id, 'verify')"
                  :disabled="isRowBusy(entry.id)"
                  @click="runAction(entry, 'verify')"
                />
                <UButton
                  size="sm"
                  variant="outline"
                  color="neutral"
                  icon="i-lucide-pencil-line"
                  :label="t('kb.actions.draft')"
                  :loading="isPending(entry.id, 'draft')"
                  :disabled="isRowBusy(entry.id)"
                  @click="runAction(entry, 'draft')"
                />
                <UButton
                  size="sm"
                  variant="ghost"
                  color="neutral"
                  icon="i-lucide-archive"
                  :label="t('kb.actions.archive')"
                  :loading="isPending(entry.id, 'archive')"
                  :disabled="isRowBusy(entry.id)"
                  @click="runAction(entry, 'archive')"
                />
                <UButton
                  size="sm"
                  variant="ghost"
                  color="error"
                  icon="i-lucide-trash-2"
                  :aria-label="t('kb.actions.delete')"
                  :title="t('kb.actions.delete')"
                  :loading="isPending(entry.id, 'delete')"
                  :disabled="isRowBusy(entry.id)"
                  @click="askDelete(entry)"
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
      </div>
    </UPage>

    <!-- Delete confirmation modal -->
    <UModal v-model:open="isDeleteModalOpen">
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center gap-3">
              <div class="flex items-center justify-center size-10 rounded-lg bg-error/10">
                <UIcon name="i-lucide-trash-2" class="size-5 text-error" />
              </div>
              <div>
                <h3 class="text-base font-semibold text-highlighted">
                  {{ t('kb.confirm.delete.title') }}
                </h3>
                <p class="text-sm text-muted">
                  {{ deleteTarget?.title }}
                </p>
              </div>
            </div>
          </template>

          <p class="text-sm text-default">
            {{ t('kb.confirm.delete.body') }}
          </p>

          <div class="flex items-center justify-end gap-3 pt-4">
            <UButton
              variant="ghost"
              color="neutral"
              :disabled="pendingAction === 'delete'"
              @click="cancelDelete"
            >
              {{ t('kb.confirm.delete.cancel') }}
            </UButton>
            <UButton
              color="error"
              :loading="pendingAction === 'delete'"
              @click="confirmDelete"
            >
              {{ t('kb.confirm.delete.cta') }}
            </UButton>
          </div>
        </UCard>
      </template>
    </UModal>
  </UPage>
</template>
