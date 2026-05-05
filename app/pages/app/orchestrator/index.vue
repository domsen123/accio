<script setup lang="ts">
/**
 * Orchestrator conversations list (T-3.13) — `/app/orchestrator`.
 *
 * Workspace-scoped, gated by `orchestrator:use` (or platform admin). Shows
 * past conversations with title / mode / model / lastMessageAt and lets the
 * user open or soft-delete each row, plus a "New conversation" button.
 *
 * Streaming + tool-call rendering land in T-3.14 / T-3.15. This page only
 * deals with metadata.
 *
 * Refs: REQ-ORCH-1 (list past conversations and resume them), REQ-ORCH-3,
 * DESIGN-API §Orchestrator.
 */
import type {
  ConversationListItem,
  ConversationListQuery,
  ConversationMode,
  ConversationSort,
} from '~/features/orchestrator/types/conversation.types'
import {
  useConversationList,
  useCreateConversation,
  useDeleteConversation,
} from '~/features/orchestrator/composables/useConversations'
import { useEligibleModels } from '~/features/orchestrator/composables/useEligibleModels'
import { usePermissions } from '~/features/permissions'

definePageMeta({
  layout: 'app',
  auth: true,
})

const { t, locale } = useI18n()
const router = useRouter()
const toast = useToast()

useSeoMeta({
  title: () => t('orchestrator.list.title'),
})

// ─── Permission gating ─────────────────────────────────────────────────────
const permissions = usePermissions()
const canUse = computed(() => {
  if (permissions.isGlobalAdmin.value)
    return true
  const orgPerms = permissions.data.value?.organisations ?? {}
  return Object.values(orgPerms).some(perms => perms.includes('orchestrator:use'))
})

// ─── Filter / pagination state ─────────────────────────────────────────────
const PAGE_SIZE = 50
const titleFilter = ref('')
const titleFilterDebounced = refDebounced(titleFilter, 250)
const includeDeleted = ref(false)
const sort = ref<ConversationSort>('updatedAt:desc')
const offset = ref(0)

const queryParams = computed<ConversationListQuery>(() => ({
  includeDeleted: includeDeleted.value,
  limit: PAGE_SIZE,
  offset: offset.value,
  sort: sort.value,
}))

watch([titleFilterDebounced, includeDeleted, sort], () => {
  offset.value = 0
})

const { rows, total, isLoading, error, refetch } = useConversationList(queryParams)

// Title filter is applied client-side because the list endpoint doesn't
// support a search parameter today; this works fine for the typical
// per-workspace conversation count.
const filteredRows = computed(() => {
  const needle = titleFilterDebounced.value.trim().toLowerCase()
  if (!needle)
    return rows.value
  return rows.value.filter((r) => {
    const title = (r.title || '').toLowerCase()
    return title.includes(needle)
  })
})

const page = computed(() => Math.floor(offset.value / PAGE_SIZE) + 1)
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
const canPrev = computed(() => offset.value > 0)
const canNext = computed(() => offset.value + PAGE_SIZE < total.value)

const goPrev = () => {
  if (canPrev.value)
    offset.value = Math.max(0, offset.value - PAGE_SIZE)
}
const goNext = () => {
  if (canNext.value)
    offset.value = offset.value + PAGE_SIZE
}

// ─── Eligible models (used for the "Default" label fallback) ───────────────
const { eligibleModels } = useEligibleModels()

const modelLabel = (modelId: string | null): string => {
  if (!modelId)
    return t('orchestrator.list.row.model.default')
  const m = eligibleModels.value.find(x => x.id === modelId)
  if (!m)
    return t('orchestrator.list.row.model.unknown')
  return `${m.providerDisplayName} · ${m.displayName}`
}

// ─── Mutations ─────────────────────────────────────────────────────────────
const createMutation = useCreateConversation()
const deleteMutation = useDeleteConversation()

const handleCreate = async () => {
  try {
    const { conversation } = await createMutation.mutateAsync({
      title: '',
      mode: 'read_only',
    })
    await router.push(String(`/app/orchestrator/${conversation.id}`))
  }
  catch (err) {
    toast.add({
      title: t('orchestrator.list.toast.error.title'),
      description: err instanceof Error ? err.message : undefined,
      color: 'error',
    })
  }
}

// ─── Delete confirmation ───────────────────────────────────────────────────
const deleteModalOpen = ref(false)
const deleteTarget = ref<ConversationListItem | null>(null)

const confirmDelete = (row: ConversationListItem) => {
  deleteTarget.value = row
  deleteModalOpen.value = true
}

const handleDelete = async () => {
  if (!deleteTarget.value)
    return
  try {
    await deleteMutation.mutateAsync(deleteTarget.value.id)
    toast.add({
      title: t('orchestrator.list.toast.deleted.title'),
      color: 'success',
    })
    deleteModalOpen.value = false
    deleteTarget.value = null
    await refetch()
  }
  catch (err) {
    toast.add({
      title: t('orchestrator.list.toast.error.title'),
      description: err instanceof Error ? err.message : undefined,
      color: 'error',
    })
  }
}

// ─── Display helpers ───────────────────────────────────────────────────────
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

const modeColor = (mode: ConversationMode): 'neutral' | 'warning' =>
  mode === 'read_write' ? 'warning' : 'neutral'

const sortOptions = computed(() => [
  { value: 'updatedAt:desc' as const, label: t('orchestrator.list.sort.updatedDesc') },
  { value: 'updatedAt:asc' as const, label: t('orchestrator.list.sort.updatedAsc') },
  { value: 'createdAt:desc' as const, label: t('orchestrator.list.sort.createdDesc') },
  { value: 'createdAt:asc' as const, label: t('orchestrator.list.sort.createdAsc') },
])

const titleOrFallback = (row: ConversationListItem) =>
  row.title?.trim() || t('orchestrator.list.row.untitled')

const detailHref = (row: ConversationListItem) =>
  `/app/orchestrator/${row.id}`
</script>

<template>
  <div class="p-4 md:p-6 space-y-6 max-w-6xl">
    <header class="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h1 class="text-2xl font-bold text-highlighted">
          {{ t('orchestrator.list.title') }}
        </h1>
        <p class="text-muted text-sm mt-1">
          {{ t('orchestrator.list.subtitle') }}
        </p>
      </div>
      <UButton
        v-if="canUse"
        icon="i-lucide-plus"
        :label="t('orchestrator.list.actions.create')"
        :loading="createMutation.asyncStatus.value === 'loading'"
        @click="handleCreate"
      />
    </header>

    <UAlert
      v-if="!canUse"
      color="warning"
      variant="soft"
      icon="i-lucide-shield-alert"
      :title="t('orchestrator.permissions.denied.title')"
      :description="t('orchestrator.permissions.denied.description')"
    />

    <template v-else>
      <!-- Filter bar -->
      <div class="flex flex-wrap items-end gap-3">
        <UFormField :label="t('orchestrator.list.filters.search.label')" class="grow min-w-60">
          <UInput
            v-model="titleFilter"
            icon="i-lucide-search"
            :placeholder="t('orchestrator.list.filters.search.placeholder')"
          />
        </UFormField>

        <UFormField :label="t('orchestrator.list.filters.sort.label')" class="min-w-52">
          <USelectMenu
            v-model="sort"
            :items="sortOptions"
            value-key="value"
            label-key="label"
          />
        </UFormField>

        <UCheckbox
          v-model="includeDeleted"
          :label="t('orchestrator.list.filters.includeDeleted')"
          class="pb-2"
        />
      </div>

      <UAlert
        v-if="error"
        color="error"
        variant="soft"
        icon="i-lucide-alert-circle"
        :title="t('orchestrator.errors.load.title')"
        :description="error.message"
      />

      <UCard>
        <template #header>
          <div class="flex items-center justify-between flex-wrap gap-2">
            <h2 class="text-lg font-semibold text-highlighted">
              {{ t('orchestrator.list.table.title') }}
            </h2>
            <div class="text-sm text-muted">
              {{ t('orchestrator.list.table.total', { total }) }}
            </div>
          </div>
        </template>

        <div v-if="isLoading && rows.length === 0" class="space-y-2">
          <USkeleton v-for="i in 4" :key="i" class="h-12 w-full" />
        </div>

        <div v-else-if="filteredRows.length === 0" class="text-sm text-muted py-8 text-center space-y-1">
          <p>{{ t('orchestrator.list.empty.title') }}</p>
          <p class="text-xs">
            {{ t('orchestrator.list.empty.subtitle') }}
          </p>
        </div>

        <ul v-else class="divide-y divide-default">
          <li
            v-for="row in filteredRows"
            :key="row.id"
            class="flex items-center gap-3 py-3"
            :class="{ 'opacity-60': row.deletedAt }"
          >
            <NuxtLink
              :to="detailHref(row)"
              class="flex-1 min-w-0 hover:bg-accented rounded p-2 -m-2 transition-colors"
            >
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-medium text-highlighted truncate">
                  {{ titleOrFallback(row) }}
                </span>
                <UBadge
                  :color="modeColor(row.mode)"
                  variant="subtle"
                  size="xs"
                >
                  {{ t(`orchestrator.modes.${row.mode}`) }}
                </UBadge>
                <UBadge
                  v-if="row.deletedAt"
                  color="neutral"
                  variant="outline"
                  size="xs"
                >
                  {{ t('orchestrator.list.row.deleted') }}
                </UBadge>
              </div>
              <div class="text-xs text-muted mt-1 flex items-center gap-3 flex-wrap">
                <span>{{ modelLabel(row.modelId) }}</span>
                <span v-if="row.lastMessageAt" class="font-mono">
                  {{ t('orchestrator.list.row.lastMessage', { when: formatRelative(row.lastMessageAt) }) }}
                </span>
                <span v-else>{{ t('orchestrator.list.row.noMessages') }}</span>
              </div>
            </NuxtLink>
            <UButton
              variant="ghost"
              size="sm"
              icon="i-lucide-message-square"
              :label="t('orchestrator.list.row.actions.open')"
              :to="detailHref(row)"
            />
            <UButton
              v-if="!row.deletedAt"
              color="error"
              variant="ghost"
              size="sm"
              icon="i-lucide-trash"
              :aria-label="t('orchestrator.list.row.actions.delete')"
              @click="confirmDelete(row)"
            />
          </li>
        </ul>

        <template #footer>
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div class="text-sm text-muted">
              {{ t('orchestrator.list.pagination.indicator', { page, totalPages }) }}
            </div>
            <div class="flex gap-2">
              <UButton
                variant="outline"
                size="sm"
                icon="i-lucide-chevron-left"
                :label="t('orchestrator.list.pagination.prev')"
                :disabled="!canPrev"
                @click="goPrev"
              />
              <UButton
                variant="outline"
                size="sm"
                trailing-icon="i-lucide-chevron-right"
                :label="t('orchestrator.list.pagination.next')"
                :disabled="!canNext"
                @click="goNext"
              />
            </div>
          </div>
        </template>
      </UCard>
    </template>

    <UModal v-model:open="deleteModalOpen" :title="t('orchestrator.list.delete.title')">
      <template #body>
        <p class="text-sm">
          {{ t('orchestrator.list.delete.body', { title: deleteTarget ? titleOrFallback(deleteTarget) : '' }) }}
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :label="t('common.cancel')"
            @click="deleteModalOpen = false"
          />
          <UButton
            color="error"
            :label="t('orchestrator.list.delete.confirm')"
            :loading="deleteMutation.asyncStatus.value === 'loading'"
            @click="handleDelete"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
