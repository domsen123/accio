<script setup lang="ts">
/**
 * Projects landing page (T-4.8) — `/app/projects`.
 *
 * Workspace-scoped, gated client-side by `project:read` (server enforces).
 * Shows the connection banner, a paginated list of cached repositories with
 * tracked badge / last sync / sync-now / track-toggle / open in github.dev,
 * and an "Add repo" entry point that links to the picker.
 *
 * Refs: REQ-PROJ-2, REQ-PROJ-4 (deep-link to github.dev), REQ-PROJ-5
 * (read-only display).
 */
import type {
  Repo,
  ReposListCacheQuery,
} from '~/features/projects/types/projects.types'
import { usePermissions } from '~/features/permissions'
import { useGhConnection } from '~/features/projects/composables/useGhConnection'
import {
  useDeleteRepo,
  useGhRepos,
  usePatchRepoTracked,
  useSyncRepo,
} from '~/features/projects/composables/useGhRepos'
import { formatGithubDevUrl } from '~/features/projects/utils/links'

definePageMeta({
  layout: 'app',
  auth: true,
})

const { t, locale } = useI18n()
const toast = useToast()

useSeoMeta({
  title: () => t('projects.list.title'),
})

// ─── Permission gating ─────────────────────────────────────────────────────
const permissions = usePermissions()

const canRead = computed(() => {
  if (permissions.isGlobalAdmin.value)
    return true
  const orgPerms = permissions.data.value?.organisations ?? {}
  return Object.values(orgPerms).some(perms => perms.includes('project:read'))
})

const canManage = computed(() => {
  if (permissions.isGlobalAdmin.value)
    return true
  const orgPerms = permissions.data.value?.organisations ?? {}
  return Object.values(orgPerms).some(perms => perms.includes('project:manage'))
})

// ─── Filter / pagination state ─────────────────────────────────────────────
const PAGE_SIZE = 50
const search = ref('')
const searchDebounced = refDebounced(search, 250)
const trackedFilter = ref<'all' | 'tracked' | 'untracked'>('all')
const offset = ref(0)

const queryParams = computed<ReposListCacheQuery>(() => ({
  source: 'cache',
  q: searchDebounced.value.trim() || undefined,
  tracked: trackedFilter.value === 'all' ? undefined : trackedFilter.value === 'tracked',
  limit: PAGE_SIZE,
  offset: offset.value,
}))

watch([searchDebounced, trackedFilter], () => {
  offset.value = 0
})

const { rows, total, isLoading, error, refetch } = useGhRepos(queryParams)

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

// ─── Connection ────────────────────────────────────────────────────────────
const { status: connectionStatus, isConnected } = useGhConnection()

// ─── Mutations ─────────────────────────────────────────────────────────────
const syncMutation = useSyncRepo()
const trackMutation = usePatchRepoTracked()
const deleteMutation = useDeleteRepo()

const syncingRepoId = ref<string | null>(null)
const handleSync = async (repo: Repo) => {
  syncingRepoId.value = repo.id
  try {
    const result = await syncMutation.mutateAsync(repo.id)
    toast.add({
      title: t('projects.list.toast.synced.title'),
      description: t('projects.list.toast.synced.description', {
        issues: result.counts.issues,
        pulls: result.counts.pulls,
        commits: result.counts.commits,
      }),
      color: 'success',
    })
  }
  catch (err) {
    toast.add({
      title: t('projects.list.toast.error.title'),
      description: err instanceof Error ? err.message : undefined,
      color: 'error',
    })
  }
  finally {
    syncingRepoId.value = null
  }
}

const togglingRepoId = ref<string | null>(null)
const handleToggleTracked = async (repo: Repo) => {
  togglingRepoId.value = repo.id
  try {
    await trackMutation.mutateAsync({ repoId: repo.id, tracked: !repo.tracked })
    toast.add({
      title: repo.tracked
        ? t('projects.list.toast.untracked.title')
        : t('projects.list.toast.tracked.title'),
      color: 'success',
    })
  }
  catch (err) {
    toast.add({
      title: t('projects.list.toast.error.title'),
      description: err instanceof Error ? err.message : undefined,
      color: 'error',
    })
  }
  finally {
    togglingRepoId.value = null
  }
}

const deleteModalOpen = ref(false)
const deleteTarget = ref<Repo | null>(null)
const askDelete = (repo: Repo) => {
  deleteTarget.value = repo
  deleteModalOpen.value = true
}
const handleDelete = async () => {
  if (!deleteTarget.value)
    return
  try {
    await deleteMutation.mutateAsync(deleteTarget.value.id)
    toast.add({
      title: t('projects.list.toast.deleted.title'),
      color: 'success',
    })
    deleteModalOpen.value = false
    deleteTarget.value = null
    await refetch()
  }
  catch (err) {
    toast.add({
      title: t('projects.list.toast.error.title'),
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

const trackedFilterOptions = computed(() => [
  { value: 'all' as const, label: t('projects.list.filters.tracked.all') },
  { value: 'tracked' as const, label: t('projects.list.filters.tracked.tracked') },
  { value: 'untracked' as const, label: t('projects.list.filters.tracked.untracked') },
])

const detailHref = (r: Repo) => `/app/projects/${r.id}`
const githubDevHref = (r: Repo) => formatGithubDevUrl(r.owner, r.name)
</script>

<template>
  <div class="p-4 md:p-6 space-y-6 max-w-6xl">
    <header class="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h1 class="text-2xl font-bold text-highlighted">
          {{ t('projects.list.title') }}
        </h1>
        <p class="text-muted text-sm mt-1">
          {{ t('projects.list.subtitle') }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          v-if="canManage"
          variant="outline"
          icon="i-lucide-link"
          :label="t('projects.list.actions.manageConnection')"
          to="/app/projects/connect"
        />
        <UButton
          v-if="canManage && isConnected"
          icon="i-lucide-plus"
          :label="t('projects.list.actions.addRepo')"
          to="/app/projects/picker"
        />
        <UButton
          v-else-if="canManage && !isConnected"
          icon="i-lucide-link"
          :label="t('projects.list.actions.connect')"
          to="/app/projects/connect"
        />
      </div>
    </header>

    <UAlert
      v-if="!canRead"
      color="warning"
      variant="soft"
      icon="i-lucide-shield-alert"
      :title="t('projects.permissions.denied.title')"
      :description="t('projects.permissions.denied.description')"
    />

    <template v-else>
      <UAlert
        v-if="!isConnected"
        color="info"
        variant="soft"
        icon="i-lucide-info"
        :title="t('projects.connection.status.notConnected')"
        :description="t('projects.list.subtitle')"
        :actions="canManage
          ? [{ label: t('projects.list.actions.connect'), to: '/app/projects/connect', color: 'primary', variant: 'solid' }]
          : undefined"
      />
      <UAlert
        v-else
        color="success"
        variant="soft"
        icon="i-lucide-check-circle"
        :title="t('projects.connection.status.connected')"
        :description="connectionStatus?.ghUserLogin
          ? `${t('projects.connection.status.ghUserLogin')}: ${connectionStatus.ghUserLogin}`
          : undefined"
      />

      <!-- Filter bar -->
      <div class="flex flex-wrap items-end gap-3">
        <UFormField :label="t('projects.list.filters.search.label')" class="grow min-w-60">
          <UInput
            v-model="search"
            icon="i-lucide-search"
            :placeholder="t('projects.list.filters.search.placeholder')"
          />
        </UFormField>

        <UFormField :label="t('projects.list.filters.tracked.label')" class="min-w-48">
          <USelectMenu
            v-model="trackedFilter"
            :items="trackedFilterOptions"
            value-key="value"
            label-key="label"
          />
        </UFormField>
      </div>

      <UAlert
        v-if="error"
        color="error"
        variant="soft"
        icon="i-lucide-alert-circle"
        :title="t('projects.errors.load.title')"
        :description="error.message"
      />

      <UCard>
        <template #header>
          <div class="flex items-center justify-between flex-wrap gap-2">
            <h2 class="text-lg font-semibold text-highlighted">
              {{ t('projects.list.table.title') }}
            </h2>
            <div class="text-sm text-muted">
              {{ t('projects.list.table.total', { total }) }}
            </div>
          </div>
        </template>

        <div v-if="isLoading && rows.length === 0" class="space-y-2">
          <USkeleton v-for="i in 4" :key="i" class="h-14 w-full" />
        </div>

        <div v-else-if="rows.length === 0" class="text-sm text-muted py-8 text-center space-y-1">
          <template v-if="searchDebounced.trim() || trackedFilter !== 'all'">
            <p>{{ t('projects.list.empty.filtered.title') }}</p>
            <p class="text-xs">
              {{ t('projects.list.empty.filtered.subtitle') }}
            </p>
          </template>
          <template v-else>
            <p>{{ t('projects.list.empty.tracked.title') }}</p>
            <p class="text-xs">
              {{ t('projects.list.empty.tracked.subtitle') }}
            </p>
          </template>
        </div>

        <ul v-else class="divide-y divide-default">
          <li
            v-for="repo in rows"
            :key="repo.id"
            class="flex items-center gap-3 py-3"
            :class="{ 'opacity-60': repo.deletedAt }"
          >
            <NuxtLink
              :to="detailHref(repo)"
              class="flex-1 min-w-0 hover:bg-accented rounded p-2 -m-2 transition-colors"
            >
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-medium text-highlighted truncate">
                  {{ repo.fullName }}
                </span>
                <UBadge
                  :color="repo.tracked ? 'success' : 'neutral'"
                  variant="subtle"
                  size="xs"
                >
                  {{ repo.tracked ? t('projects.list.row.tracked') : t('projects.list.row.untracked') }}
                </UBadge>
                <UBadge
                  v-if="repo.private"
                  color="neutral"
                  variant="outline"
                  size="xs"
                >
                  {{ t('projects.list.row.private') }}
                </UBadge>
              </div>
              <div class="text-xs text-muted mt-1 flex items-center gap-3 flex-wrap">
                <span v-if="repo.lastSyncedAt" class="font-mono">
                  {{ t('projects.list.row.lastSyncAgo', { when: formatRelative(repo.lastSyncedAt) }) }}
                </span>
                <span v-else>{{ t('projects.list.row.neverSynced') }}</span>
                <span v-if="repo.description" class="truncate">{{ repo.description }}</span>
              </div>
            </NuxtLink>
            <div class="flex items-center gap-1 shrink-0">
              <UButton
                variant="ghost"
                size="sm"
                icon="i-lucide-external-link"
                :to="githubDevHref(repo)"
                target="_blank"
                rel="noopener noreferrer"
                :aria-label="t('projects.list.row.actions.openInGithubDev')"
              />
              <UButton
                v-if="canManage && repo.tracked"
                variant="ghost"
                size="sm"
                icon="i-lucide-refresh-cw"
                :label="t('projects.list.row.actions.syncNow')"
                :loading="syncingRepoId === repo.id"
                :disabled="syncingRepoId !== null"
                @click="handleSync(repo)"
              />
              <UButton
                v-if="canManage"
                variant="ghost"
                size="sm"
                :icon="repo.tracked ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                :label="repo.tracked ? t('projects.list.row.actions.untrack') : t('projects.list.row.actions.track')"
                :loading="togglingRepoId === repo.id"
                @click="handleToggleTracked(repo)"
              />
              <UButton
                v-if="canManage"
                color="error"
                variant="ghost"
                size="sm"
                icon="i-lucide-trash"
                :aria-label="t('projects.list.row.actions.delete')"
                @click="askDelete(repo)"
              />
            </div>
          </li>
        </ul>

        <template #footer>
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div class="text-sm text-muted">
              {{ t('projects.list.pagination.indicator', { page, totalPages }) }}
            </div>
            <div class="flex gap-2">
              <UButton
                variant="outline"
                size="sm"
                icon="i-lucide-chevron-left"
                :label="t('projects.list.pagination.prev')"
                :disabled="!canPrev"
                @click="goPrev"
              />
              <UButton
                variant="outline"
                size="sm"
                trailing-icon="i-lucide-chevron-right"
                :label="t('projects.list.pagination.next')"
                :disabled="!canNext"
                @click="goNext"
              />
            </div>
          </div>
        </template>
      </UCard>
    </template>

    <UModal v-model:open="deleteModalOpen" :title="t('projects.list.delete.title')">
      <template #body>
        <p class="text-sm">
          {{ t('projects.list.delete.body', { full: deleteTarget?.fullName ?? '' }) }}
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
            :label="t('projects.list.delete.confirm')"
            :loading="deleteMutation.asyncStatus.value === 'loading'"
            @click="handleDelete"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
