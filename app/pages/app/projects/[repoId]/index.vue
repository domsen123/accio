<script setup lang="ts">
/**
 * Repo detail page (T-4.8) — `/app/projects/[repoId]`.
 *
 * Header with metadata + sync now + open in github.dev / on github.com
 * deep-links, plus three in-page tabs (issues / pulls / commits) with the
 * filters spelled out in the brief. Each row links to its `html_url` per
 * REQ-PROJ-4.
 *
 * Refs: REQ-PROJ-4, REQ-PROJ-5.
 */
import type { BreadcrumbItem } from '@nuxt/ui'
import type {
  CommitsListQuery,
  IssuesListQuery,
  PullsListQuery,
} from '~/features/projects/types/projects.types'
import { usePermissions } from '~/features/permissions'
import {
  useGhRepoCommits,
  useGhRepoIssues,
  useGhRepoPulls,
} from '~/features/projects/composables/useGhRepoChildren'
import {
  useGhRepo,
  usePatchRepoTracked,
  useSyncRepo,
} from '~/features/projects/composables/useGhRepos'
import {
  formatGithubDevUrl,
  formatGithubRepoUrl,
} from '~/features/projects/utils/links'

definePageMeta({
  layout: 'app',
  auth: true,
})

const { t, locale } = useI18n()
const route = useRoute()
const toast = useToast()

const repoId = computed(() => String(route.params.repoId ?? ''))

useSeoMeta({
  title: () => t('projects.list.title'),
})

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

const { repo, isLoading, error, refetch } = useGhRepo(repoId)

// ─── Tabs ──────────────────────────────────────────────────────────────────
type TabKey = 'issues' | 'pulls' | 'commits'
const activeTab = ref<TabKey>('issues')

const tabs = computed(() => [
  { value: 'issues' as const, label: t('projects.detail.tabs.issues') },
  { value: 'pulls' as const, label: t('projects.detail.tabs.pulls') },
  { value: 'commits' as const, label: t('projects.detail.tabs.commits') },
])

// ─── Issues ────────────────────────────────────────────────────────────────
const issuesState = ref<'open' | 'closed' | 'all'>('open')
const issuesQ = ref('')
const issuesQDebounced = refDebounced(issuesQ, 250)
const issuesLabelsInput = ref('')
const issuesLabels = computed(() =>
  issuesLabelsInput.value
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0),
)
const issuesOffset = ref(0)
const ISSUES_PAGE = 50

const issuesParams = computed<IssuesListQuery>(() => ({
  state: issuesState.value,
  q: issuesQDebounced.value.trim() || undefined,
  labels: issuesLabels.value.length > 0 ? issuesLabels.value : undefined,
  limit: ISSUES_PAGE,
  offset: issuesOffset.value,
  sort: 'updatedAt:desc',
}))
watch([issuesState, issuesQDebounced, issuesLabels], () => {
  issuesOffset.value = 0
})

const issuesQuery = useGhRepoIssues(repoId, issuesParams)

// ─── Pulls ─────────────────────────────────────────────────────────────────
const pullsState = ref<'open' | 'closed' | 'merged' | 'all'>('open')
const pullsQ = ref('')
const pullsQDebounced = refDebounced(pullsQ, 250)
const pullsLabelsInput = ref('')
const pullsLabels = computed(() =>
  pullsLabelsInput.value
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0),
)
const pullsOffset = ref(0)
const PULLS_PAGE = 50

const pullsParams = computed<PullsListQuery>(() => ({
  state: pullsState.value,
  q: pullsQDebounced.value.trim() || undefined,
  labels: pullsLabels.value.length > 0 ? pullsLabels.value : undefined,
  limit: PULLS_PAGE,
  offset: pullsOffset.value,
  sort: 'updatedAt:desc',
}))
watch([pullsState, pullsQDebounced, pullsLabels], () => {
  pullsOffset.value = 0
})

const pullsQuery = useGhRepoPulls(repoId, pullsParams)

// ─── Commits ───────────────────────────────────────────────────────────────
const commitsSince = ref('')
const commitsAuthor = ref('')
const commitsAuthorDebounced = refDebounced(commitsAuthor, 250)
const COMMITS_PAGE = 50

const commitsParams = computed<CommitsListQuery>(() => ({
  since: commitsSince.value.trim()
    ? new Date(commitsSince.value).toISOString()
    : undefined,
  author: commitsAuthorDebounced.value.trim() || undefined,
  limit: COMMITS_PAGE,
  offset: 0,
}))

const commitsQuery = useGhRepoCommits(repoId, commitsParams)

// ─── Filter options ───────────────────────────────────────────────────────
const issueStateOptions = computed(() => [
  { value: 'open' as const, label: t('projects.detail.filters.state.open') },
  { value: 'closed' as const, label: t('projects.detail.filters.state.closed') },
  { value: 'all' as const, label: t('projects.detail.filters.state.all') },
])
const pullStateOptions = computed(() => [
  { value: 'open' as const, label: t('projects.detail.filters.state.open') },
  { value: 'merged' as const, label: t('projects.detail.filters.state.merged') },
  { value: 'closed' as const, label: t('projects.detail.filters.state.closed') },
  { value: 'all' as const, label: t('projects.detail.filters.state.all') },
])

// ─── Mutations ─────────────────────────────────────────────────────────────
const syncMutation = useSyncRepo()
const trackMutation = usePatchRepoTracked()

const handleSync = async () => {
  if (!repo.value)
    return
  try {
    const result = await syncMutation.mutateAsync(repo.value.id)
    toast.add({
      title: t('projects.list.toast.synced.title'),
      description: t('projects.list.toast.synced.description', {
        issues: result.counts.issues,
        pulls: result.counts.pulls,
        commits: result.counts.commits,
      }),
      color: 'success',
    })
    await refetch()
  }
  catch (err) {
    toast.add({
      title: t('projects.errors.action.title'),
      description: err instanceof Error ? err.message : undefined,
      color: 'error',
    })
  }
}

const handleToggleTracked = async () => {
  if (!repo.value)
    return
  try {
    await trackMutation.mutateAsync({ repoId: repo.value.id, tracked: !repo.value.tracked })
    toast.add({
      title: repo.value.tracked
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

const shortSha = (sha: string) => sha.slice(0, 7)
const shortMessage = (msg: string) => msg.split('\n')[0] ?? ''

const pullStateColor = (s: 'open' | 'closed' | 'merged'): 'success' | 'error' | 'info' => {
  if (s === 'merged')
    return 'info'
  if (s === 'open')
    return 'success'
  return 'error'
}

const userLogin = (u: unknown): string => {
  if (u && typeof u === 'object' && 'login' in u && typeof (u as { login: unknown }).login === 'string')
    return (u as { login: string }).login
  return ''
}

const labelsArray = (labels: unknown): string[] => {
  if (Array.isArray(labels))
    return labels.filter((s): s is string => typeof s === 'string')
  return []
}

const breadcrumbItems = computed<BreadcrumbItem[]>(() => [
  { label: t('projects.list.title'), to: '/app/projects' },
  { label: repo.value?.fullName ?? '…' },
])
</script>

<template>
  <UPage>
    <UPageHeader
      :title="repo?.fullName ?? t('projects.list.title')"
      :description="repo?.description ?? undefined"
      :ui="{ root: 'border-none' }"
    >
      <template #headline>
        <UBreadcrumb :items="breadcrumbItems" />
      </template>
      <template v-if="repo" #links>
        <UButton
          v-if="canManage && repo.tracked"
          color="primary"
          icon="i-lucide-refresh-cw"
          :label="t('projects.detail.actions.syncNow')"
          :loading="syncMutation.asyncStatus.value === 'loading'"
          @click="handleSync"
        />
        <UButton
          v-if="canManage"
          variant="outline"
          :icon="repo.tracked ? 'i-lucide-eye-off' : 'i-lucide-eye'"
          :label="repo.tracked
            ? t('projects.detail.actions.untrack')
            : t('projects.detail.actions.track')"
          :loading="trackMutation.asyncStatus.value === 'loading'"
          @click="handleToggleTracked"
        />
        <UButton
          variant="outline"
          icon="i-lucide-external-link"
          :label="t('projects.detail.actions.openInGithubDev')"
          :to="formatGithubDevUrl(repo.owner, repo.name)"
          target="_blank"
          rel="noopener noreferrer"
        />
        <UButton
          variant="ghost"
          icon="i-lucide-github"
          :label="t('projects.detail.actions.openOnGithub')"
          :to="formatGithubRepoUrl(repo.owner, repo.name)"
          target="_blank"
          rel="noopener noreferrer"
        />
      </template>
    </UPageHeader>

    <UPage>
      <div class="space-y-6 max-w-6xl">
        <UAlert
          v-if="!canRead"
          color="warning"
          variant="soft"
          icon="i-lucide-shield-alert"
          :title="t('projects.permissions.denied.title')"
          :description="t('projects.permissions.denied.description')"
        />

        <template v-else>
          <div v-if="isLoading && !repo" class="space-y-3">
            <USkeleton class="h-24 w-full" />
            <USkeleton class="h-32 w-full" />
          </div>

          <UAlert
            v-else-if="error"
            color="error"
            variant="soft"
            icon="i-lucide-alert-circle"
            :title="t('projects.errors.load.title')"
            :description="error.message"
          />

          <template v-else-if="repo">
            <!-- Metadata badges -->
            <div class="flex items-center gap-2 flex-wrap text-xs">
              <UBadge :color="repo.tracked ? 'success' : 'neutral'" variant="subtle" size="xs">
                {{ repo.tracked ? t('projects.detail.header.tracked') : t('projects.detail.header.untracked') }}
              </UBadge>
              <UBadge v-if="repo.private" color="neutral" variant="outline" size="xs">
                {{ t('projects.detail.header.private') }}
              </UBadge>
              <UBadge v-if="repo.defaultBranch" color="neutral" variant="outline" size="xs">
                {{ t('projects.detail.header.defaultBranch') }}: {{ repo.defaultBranch }}
              </UBadge>
              <span class="text-muted">
                {{ t('projects.detail.header.lastSyncedAt') }}:
                <span v-if="repo.lastSyncedAt" class="font-mono">{{ formatRelative(repo.lastSyncedAt) }}</span>
                <span v-else>{{ t('projects.detail.header.neverSynced') }}</span>
              </span>
            </div>

            <!-- Tabs -->
            <UTabs
              v-model="activeTab"
              :items="tabs"
              value-key="value"
              label-key="label"
              variant="link"
            />

            <!-- Issues -->
            <section v-if="activeTab === 'issues'" class="space-y-4">
              <div class="flex flex-wrap items-end gap-3">
                <UFormField :label="t('projects.detail.filters.state.label')" class="min-w-40">
                  <USelectMenu
                    v-model="issuesState"
                    :items="issueStateOptions"
                    value-key="value"
                    label-key="label"
                  />
                </UFormField>
                <UFormField class="grow min-w-60">
                  <UInput
                    v-model="issuesQ"
                    icon="i-lucide-search"
                    :placeholder="t('projects.detail.filters.search.placeholder')"
                  />
                </UFormField>
                <UFormField class="min-w-60">
                  <UInput
                    v-model="issuesLabelsInput"
                    icon="i-lucide-tag"
                    :placeholder="t('projects.detail.filters.labels.placeholder')"
                  />
                </UFormField>
              </div>

              <UAlert
                v-if="issuesQuery.error.value"
                color="error"
                variant="soft"
                icon="i-lucide-alert-circle"
                :title="t('projects.errors.load.title')"
                :description="issuesQuery.error.value.message"
              />

              <div v-if="issuesQuery.isLoading.value && issuesQuery.rows.value.length === 0" class="space-y-2">
                <USkeleton v-for="i in 3" :key="i" class="h-16 w-full" />
              </div>

              <div v-else-if="issuesQuery.rows.value.length === 0" class="text-sm text-muted py-8 text-center space-y-1">
                <p>{{ t('projects.detail.issues.empty.title') }}</p>
                <p class="text-xs">
                  {{ t('projects.detail.issues.empty.subtitle') }}
                </p>
              </div>

              <ul v-else class="divide-y divide-default border border-default rounded">
                <li
                  v-for="issue in issuesQuery.rows.value"
                  :key="issue.id"
                  class="p-3"
                >
                  <div class="flex items-center gap-2 flex-wrap">
                    <UBadge
                      :color="issue.state === 'open' ? 'success' : 'neutral'"
                      variant="subtle"
                      size="xs"
                    >
                      {{ issue.state }}
                    </UBadge>
                    <NuxtLink
                      :to="issue.htmlUrl"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="font-medium text-highlighted hover:underline truncate"
                    >
                      <span class="font-mono">#{{ issue.number }}</span> {{ issue.title }}
                    </NuxtLink>
                    <UBadge
                      v-for="label in labelsArray(issue.labels)"
                      :key="label"
                      color="neutral"
                      variant="outline"
                      size="xs"
                    >
                      {{ label }}
                    </UBadge>
                  </div>
                  <div class="text-xs text-muted mt-1 flex items-center gap-3 flex-wrap">
                    <span>{{ t('projects.detail.issues.row.openedBy', { login: userLogin(issue.author) }) }}</span>
                    <span v-if="issue.ghCreatedAt">
                      {{ t('projects.detail.issues.row.openedAt', { when: formatRelative(issue.ghCreatedAt) }) }}
                    </span>
                    <span v-if="issue.ghClosedAt">
                      {{ t('projects.detail.issues.row.closedAt', { when: formatRelative(issue.ghClosedAt) }) }}
                    </span>
                    <span>{{ t('projects.detail.issues.row.comments', { n: issue.commentsCount }) }}</span>
                  </div>
                </li>
              </ul>
            </section>

            <!-- Pulls -->
            <section v-if="activeTab === 'pulls'" class="space-y-4">
              <div class="flex flex-wrap items-end gap-3">
                <UFormField :label="t('projects.detail.filters.state.label')" class="min-w-40">
                  <USelectMenu
                    v-model="pullsState"
                    :items="pullStateOptions"
                    value-key="value"
                    label-key="label"
                  />
                </UFormField>
                <UFormField class="grow min-w-60">
                  <UInput
                    v-model="pullsQ"
                    icon="i-lucide-search"
                    :placeholder="t('projects.detail.filters.search.placeholder')"
                  />
                </UFormField>
                <UFormField class="min-w-60">
                  <UInput
                    v-model="pullsLabelsInput"
                    icon="i-lucide-tag"
                    :placeholder="t('projects.detail.filters.labels.placeholder')"
                  />
                </UFormField>
              </div>

              <UAlert
                v-if="pullsQuery.error.value"
                color="error"
                variant="soft"
                icon="i-lucide-alert-circle"
                :title="t('projects.errors.load.title')"
                :description="pullsQuery.error.value.message"
              />

              <div v-if="pullsQuery.isLoading.value && pullsQuery.rows.value.length === 0" class="space-y-2">
                <USkeleton v-for="i in 3" :key="i" class="h-16 w-full" />
              </div>

              <div v-else-if="pullsQuery.rows.value.length === 0" class="text-sm text-muted py-8 text-center space-y-1">
                <p>{{ t('projects.detail.pulls.empty.title') }}</p>
                <p class="text-xs">
                  {{ t('projects.detail.pulls.empty.subtitle') }}
                </p>
              </div>

              <ul v-else class="divide-y divide-default border border-default rounded">
                <li
                  v-for="pull in pullsQuery.rows.value"
                  :key="pull.id"
                  class="p-3"
                >
                  <div class="flex items-center gap-2 flex-wrap">
                    <UBadge
                      :color="pullStateColor(pull.state)"
                      variant="subtle"
                      size="xs"
                    >
                      {{ t(`projects.detail.pulls.row.${pull.state}`) }}
                    </UBadge>
                    <UBadge v-if="pull.draft" color="neutral" variant="outline" size="xs">
                      {{ t('projects.detail.pulls.row.draft') }}
                    </UBadge>
                    <NuxtLink
                      :to="pull.htmlUrl"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="font-medium text-highlighted hover:underline truncate"
                    >
                      <span class="font-mono">#{{ pull.number }}</span> {{ pull.title }}
                    </NuxtLink>
                  </div>
                  <div class="text-xs text-muted mt-1 flex items-center gap-3 flex-wrap">
                    <span>{{ t('projects.detail.pulls.row.openedBy', { login: userLogin(pull.author) }) }}</span>
                    <span class="font-mono">
                      {{ t('projects.detail.pulls.row.branches', { base: pull.baseRef, head: pull.headRef }) }}
                    </span>
                    <span v-if="pull.ghUpdatedAt" class="font-mono">{{ formatRelative(pull.ghUpdatedAt) }}</span>
                  </div>
                </li>
              </ul>
            </section>

            <!-- Commits -->
            <section v-if="activeTab === 'commits'" class="space-y-4">
              <div class="flex flex-wrap items-end gap-3">
                <UFormField :label="t('projects.detail.filters.since.label')" class="min-w-44">
                  <UInput v-model="commitsSince" type="date" />
                </UFormField>
                <UFormField :label="t('projects.detail.filters.author.label')" class="min-w-60">
                  <UInput
                    v-model="commitsAuthor"
                    :placeholder="t('projects.detail.filters.author.placeholder')"
                  />
                </UFormField>
              </div>

              <UAlert
                v-if="commitsQuery.error.value"
                color="error"
                variant="soft"
                icon="i-lucide-alert-circle"
                :title="t('projects.errors.load.title')"
                :description="commitsQuery.error.value.message"
              />

              <div v-if="commitsQuery.isLoading.value && commitsQuery.rows.value.length === 0" class="space-y-2">
                <USkeleton v-for="i in 3" :key="i" class="h-12 w-full" />
              </div>

              <div v-else-if="commitsQuery.rows.value.length === 0" class="text-sm text-muted py-8 text-center space-y-1">
                <p>{{ t('projects.detail.commits.empty.title') }}</p>
                <p class="text-xs">
                  {{ t('projects.detail.commits.empty.subtitle') }}
                </p>
              </div>

              <ul v-else class="divide-y divide-default border border-default rounded">
                <li
                  v-for="commit in commitsQuery.rows.value"
                  :key="commit.id"
                  class="p-3"
                >
                  <div class="flex items-center gap-2 flex-wrap">
                    <NuxtLink
                      :to="commit.htmlUrl"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="font-mono text-xs text-muted hover:underline shrink-0"
                    >
                      {{ shortSha(commit.sha) }}
                    </NuxtLink>
                    <span class="font-medium text-highlighted truncate">
                      {{ shortMessage(commit.message) }}
                    </span>
                  </div>
                  <div class="text-xs text-muted mt-1 flex items-center gap-3 flex-wrap">
                    <span>
                      {{ t('projects.detail.commits.row.by', {
                        who: commit.authorLogin || commit.authorName || '',
                      }) }}
                    </span>
                    <span v-if="commit.authoredAt" class="font-mono">{{ formatRelative(commit.authoredAt) }}</span>
                  </div>
                </li>
              </ul>
            </section>
          </template>
        </template>
      </div>
    </UPage>
  </UPage>
</template>
