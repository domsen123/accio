<script setup lang="ts">
/**
 * Repo picker page (T-4.8) — `/app/projects/picker`.
 *
 * Lists accessible repositories from the connected GitHub account
 * (`GET /api/projects/repos?source=github`) joined against the local cache
 * so we can show `isCached` / `isTracked` indicators and toggle tracking.
 * Uncached rows go through `POST /api/projects/repos/track` which inserts a
 * stub on first track; cached rows go through PATCH by `repoId`.
 *
 * Refs: REQ-PROJ-2 (list accessible repos), REQ-PROJ-4 (deep links).
 */
import type { BreadcrumbItem } from '@nuxt/ui'
import type { AccessibleRepo } from '~/features/projects/types/projects.types'
import { usePermissions } from '~/features/permissions'
import { useGhConnection } from '~/features/projects/composables/useGhConnection'
import {
  useGhAccessibleRepos,
  useGhRepos,
  usePatchRepoTracked,
  useTrackRepoByName,
} from '~/features/projects/composables/useGhRepos'
import { formatGithubDevUrl } from '~/features/projects/utils/links'

definePageMeta({
  layout: 'app',
  auth: true,
})

const { t } = useI18n()
const toast = useToast()

useSeoMeta({
  title: () => t('projects.picker.title'),
})

const permissions = usePermissions()
const canManage = computed(() => {
  if (permissions.isGlobalAdmin.value)
    return true
  const orgPerms = permissions.data.value?.organisations ?? {}
  return Object.values(orgPerms).some(perms => perms.includes('project:manage'))
})

const { isConnected } = useGhConnection()

const { repos, isLoading, error } = useGhAccessibleRepos(isConnected)

// Pull all cached repos so we can resolve `repoId` for accessible rows that
// already exist locally — needed because PATCH is keyed on the UUID.
const { rows: cachedRows } = useGhRepos(() => ({
  source: 'cache',
  limit: 200,
  includeDeleted: true,
}))

const cachedByGhId = computed(() => {
  const m = new Map<number, string>()
  for (const r of cachedRows.value)
    m.set(r.ghId, r.id)
  return m
})

const search = ref('')
const trackedOnly = ref(false)
const cachedOnly = ref(false)

const filteredRepos = computed<AccessibleRepo[]>(() => {
  const needle = search.value.trim().toLowerCase()
  return repos.value.filter((r) => {
    if (trackedOnly.value && !r.isTracked)
      return false
    if (cachedOnly.value && !r.isCached)
      return false
    if (!needle)
      return true
    return r.fullName.toLowerCase().includes(needle)
      || (r.description ?? '').toLowerCase().includes(needle)
  })
})

const patchMutation = usePatchRepoTracked()
const trackByNameMutation = useTrackRepoByName()
const togglingGhId = ref<number | null>(null)

const handleToggle = async (row: AccessibleRepo) => {
  togglingGhId.value = row.ghId
  try {
    const repoId = cachedByGhId.value.get(row.ghId)
    if (repoId) {
      await patchMutation.mutateAsync({ repoId, tracked: !row.isTracked })
    }
    else {
      await trackByNameMutation.mutateAsync({
        owner: row.owner,
        name: row.name,
        tracked: !row.isTracked,
      })
    }
    toast.add({
      title: row.isTracked
        ? t('projects.list.toast.untracked.title')
        : t('projects.list.toast.tracked.title'),
      color: 'success',
    })
  }
  catch (err) {
    toast.add({
      title: t('projects.errors.action.title'),
      description: err instanceof Error ? err.message : undefined,
      color: 'error',
    })
  }
  finally {
    togglingGhId.value = null
  }
}

const breadcrumbItems = computed<BreadcrumbItem[]>(() => [
  { label: t('projects.list.title'), to: '/app/projects' },
  { label: t('projects.picker.title') },
])
</script>

<template>
  <UPage>
    <UPageHeader
      :title="t('projects.picker.title')"
      :description="t('projects.picker.subtitle')"
      :ui="{ root: 'border-none' }"
    >
      <template #headline>
        <UBreadcrumb :items="breadcrumbItems" />
      </template>
    </UPageHeader>

    <UPage>
      <div class="space-y-6 max-w-5xl">
        <UAlert
          v-if="!isConnected"
          color="info"
          variant="soft"
          icon="i-lucide-info"
          :title="t('projects.picker.noConnection.title')"
          :description="t('projects.picker.noConnection.description')"
          :actions="[{ label: t('projects.picker.noConnection.action'), to: '/app/projects/connect', color: 'primary', variant: 'solid' }]"
        />

        <template v-else>
          <UAlert
            v-if="error"
            color="error"
            variant="soft"
            icon="i-lucide-alert-circle"
            :title="t('projects.errors.load.title')"
            :description="error.message"
          />

          <div class="flex flex-wrap items-end gap-3">
            <UFormField class="grow min-w-60">
              <UInput
                v-model="search"
                icon="i-lucide-search"
                :placeholder="t('projects.picker.search.placeholder')"
              />
            </UFormField>
            <UCheckbox
              v-model="trackedOnly"
              :label="t('projects.picker.filters.showTrackedOnly')"
              class="pb-2"
            />
            <UCheckbox
              v-model="cachedOnly"
              :label="t('projects.picker.filters.showCachedOnly')"
              class="pb-2"
            />
          </div>

          <UCard>
            <div v-if="isLoading && repos.length === 0" class="space-y-2">
              <USkeleton v-for="i in 5" :key="i" class="h-14 w-full" />
            </div>

            <div v-else-if="filteredRepos.length === 0" class="text-sm text-muted py-8 text-center space-y-1">
              <p>{{ t('projects.picker.empty.title') }}</p>
              <p class="text-xs">
                {{ t('projects.picker.empty.subtitle') }}
              </p>
            </div>

            <ul v-else class="divide-y divide-default">
              <li
                v-for="row in filteredRepos"
                :key="row.ghId"
                class="flex items-center gap-3 py-3"
              >
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-medium text-highlighted truncate">
                      {{ row.fullName }}
                    </span>
                    <UBadge
                      v-if="row.private"
                      color="neutral"
                      variant="outline"
                      size="xs"
                    >
                      {{ t('projects.picker.row.private') }}
                    </UBadge>
                    <UBadge
                      v-if="row.isTracked"
                      color="success"
                      variant="subtle"
                      size="xs"
                    >
                      {{ t('projects.picker.row.tracked') }}
                    </UBadge>
                    <UBadge
                      v-else-if="row.isCached"
                      color="info"
                      variant="subtle"
                      size="xs"
                    >
                      {{ t('projects.picker.row.cached') }}
                    </UBadge>
                  </div>
                  <p v-if="row.description" class="text-xs text-muted mt-1 truncate">
                    {{ row.description }}
                  </p>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <UButton
                    variant="ghost"
                    size="sm"
                    icon="i-lucide-external-link"
                    :to="formatGithubDevUrl(row.owner, row.name)"
                    target="_blank"
                    rel="noopener noreferrer"
                    :aria-label="t('projects.picker.row.actions.open')"
                  />
                  <UButton
                    v-if="canManage"
                    variant="ghost"
                    size="sm"
                    :icon="row.isTracked ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                    :label="row.isTracked
                      ? t('projects.picker.row.actions.untrack')
                      : t('projects.picker.row.actions.track')"
                    :loading="togglingGhId === row.ghId"
                    @click="handleToggle(row)"
                  />
                </div>
              </li>
            </ul>
          </UCard>
        </template>
      </div>
    </UPage>
  </UPage>
</template>
