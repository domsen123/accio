<script setup lang="ts">
/**
 * Orchestrator audit log page (T-3.8) — `/app/settings/audit`.
 *
 * Workspace-scoped, gated by `orchestrator:audit:view` (Owner-only per
 * DESIGN-RBAC). Shows every recorded `orchestrator_actions` row with a
 * filter bar (tool name, status, class, date range), pagination, and a
 * detail drawer surfacing the raw `parameters` / `result` / `error` JSON.
 *
 * Refs: REQ-ORCH-6 (audit log fields), DESIGN-API §Orchestrator,
 * DESIGN-RBAC `orchestrator:audit:view`.
 */
import type { BreadcrumbItem } from '@nuxt/ui'
import type {
  AuditActionClass,
  AuditActionStatus,
  AuditListQuery,
  AuditRow,
} from '~/features/orchestrator/types/audit.types'
import { useAuditList, useAuditRow } from '~/features/orchestrator/composables/useAuditLog'
import { usePermissions } from '~/features/permissions'

definePageMeta({
  layout: 'app',
  auth: true,
})

const { t, locale } = useI18n()

useSeoMeta({
  title: () => t('audit.title'),
})

// ─── Permission gating ───────────────────────────────────────────────────
//
// Server-side `requirePermission` is the source of truth; this client check
// just hides the page content for users who definitely cannot view it.
const permissions = usePermissions()
const canView = computed(() => {
  if (permissions.isGlobalAdmin.value)
    return true
  const orgPerms = permissions.data.value?.organisations ?? {}
  return Object.values(orgPerms).some(perms => perms.includes('orchestrator:audit:view'))
})

// ─── Filter state ────────────────────────────────────────────────────────
const PAGE_SIZE = 50

const toolNameInput = ref('')
const statusFilter = ref<AuditActionStatus[]>([])
const classFilter = ref<AuditActionClass[]>([])
const sinceInput = ref('')
const untilInput = ref('')
const offset = ref(0)

const statusOptions = computed(() => ([
  { value: 'pending_confirmation' as const, label: t('audit.status.pending_confirmation') },
  { value: 'confirmed' as const, label: t('audit.status.confirmed') },
  { value: 'cancelled' as const, label: t('audit.status.cancelled') },
  { value: 'executed' as const, label: t('audit.status.executed') },
  { value: 'failed' as const, label: t('audit.status.failed') },
]))

const classOptions = computed(() => ([
  { value: 'auto' as const, label: t('audit.class.auto') },
  { value: 'confirm' as const, label: t('audit.class.confirm') },
]))

// Convert local datetime-local input -> ISO with offset. Empty string -> undefined.
const toIsoOrUndefined = (v: string): string | undefined => {
  if (!v.trim())
    return undefined
  const d = new Date(v)
  if (Number.isNaN(d.getTime()))
    return undefined
  return d.toISOString()
}

const queryParams = computed<AuditListQuery>(() => ({
  toolName: toolNameInput.value.trim() || undefined,
  status: statusFilter.value.length > 0 ? statusFilter.value : undefined,
  class: classFilter.value.length > 0 ? classFilter.value : undefined,
  since: toIsoOrUndefined(sinceInput.value),
  until: toIsoOrUndefined(untilInput.value),
  limit: PAGE_SIZE,
  offset: offset.value,
  sort: 'createdAt:desc',
}))

// Reset paging when filters change.
watch([toolNameInput, statusFilter, classFilter, sinceInput, untilInput], () => {
  offset.value = 0
})

const { rows, total, isLoading, error } = useAuditList(queryParams)

const page = computed(() => Math.floor(offset.value / PAGE_SIZE) + 1)
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
const canPrev = computed(() => offset.value > 0)
const canNext = computed(() => offset.value + PAGE_SIZE < total.value)

const goPrev = () => {
  if (!canPrev.value)
    return
  offset.value = Math.max(0, offset.value - PAGE_SIZE)
}
const goNext = () => {
  if (!canNext.value)
    return
  offset.value = offset.value + PAGE_SIZE
}

const clearFilters = () => {
  toolNameInput.value = ''
  statusFilter.value = []
  classFilter.value = []
  sinceInput.value = ''
  untilInput.value = ''
  offset.value = 0
}

// ─── Drawer / detail ─────────────────────────────────────────────────────
const drawerOpen = ref(false)
const activeRowId = ref<string | null>(null)

const { row: activeRow, isLoading: rowLoading } = useAuditRow(activeRowId)

const openRow = (row: AuditRow) => {
  activeRowId.value = row.id
  drawerOpen.value = true
}

const closeDrawer = () => {
  drawerOpen.value = false
  // Keep id so the drawer can finish its closing animation; clear next tick.
  setTimeout(() => {
    if (!drawerOpen.value)
      activeRowId.value = null
  }, 200)
}

// ─── Display helpers ─────────────────────────────────────────────────────
const formatDateTime = (iso: string | null) => {
  if (!iso)
    return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime()))
    return iso
  return new Intl.DateTimeFormat(locale.value, {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(d)
}

const statusColour = (status: AuditActionStatus): 'primary' | 'neutral' | 'success' | 'error' | 'warning' => {
  switch (status) {
    case 'executed': return 'success'
    case 'failed': return 'error'
    case 'cancelled': return 'neutral'
    case 'pending_confirmation': return 'warning'
    case 'confirmed': return 'primary'
    default: return 'neutral'
  }
}

const formatJson = (value: unknown): string => {
  if (value === null || value === undefined)
    return '—'
  try {
    return JSON.stringify(value, null, 2)
  }
  catch {
    return String(value)
  }
}

const userShort = (userId: string | null): string => {
  if (!userId)
    return '—'
  return userId.length > 10 ? `${userId.slice(0, 6)}…${userId.slice(-4)}` : userId
}

const breadcrumbItems = computed<BreadcrumbItem[]>(() => [
  { label: t('settings.index.title'), to: '/app/settings' },
  { label: t('audit.title') },
])
</script>

<template>
  <UPage>
    <UPageHeader
      :title="t('audit.title')"
      :description="t('audit.subtitle')"
      :ui="{ root: 'border-none' }"
    >
      <template #headline>
        <UBreadcrumb :items="breadcrumbItems" />
      </template>
    </UPageHeader>

    <UPage>
      <div class="space-y-6 max-w-7xl">
        <UAlert
          v-if="!canView"
          color="warning"
          variant="soft"
          icon="i-lucide-shield-alert"
          :title="t('audit.permissions.denied.title')"
          :description="t('audit.permissions.denied.description')"
        />

        <template v-else>
          <!-- Filter bar -->
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="text-lg font-semibold text-highlighted">
                  {{ t('audit.filters.title') }}
                </h2>
                <UButton
                  variant="ghost"
                  size="sm"
                  icon="i-lucide-rotate-ccw"
                  :label="t('audit.filters.clear')"
                  @click="clearFilters"
                />
              </div>
            </template>

            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <UFormField :label="t('audit.filters.toolName.label')">
                <UInput
                  v-model="toolNameInput"
                  :placeholder="t('audit.filters.toolName.placeholder')"
                  icon="i-lucide-search"
                />
              </UFormField>

              <UFormField :label="t('audit.filters.status.label')">
                <USelectMenu
                  v-model="statusFilter"
                  multiple
                  :items="statusOptions"
                  value-key="value"
                  label-key="label"
                  :placeholder="t('audit.filters.status.placeholder')"
                />
              </UFormField>

              <UFormField :label="t('audit.filters.class.label')">
                <USelectMenu
                  v-model="classFilter"
                  multiple
                  :items="classOptions"
                  value-key="value"
                  label-key="label"
                  :placeholder="t('audit.filters.class.placeholder')"
                />
              </UFormField>

              <UFormField :label="t('audit.filters.since.label')">
                <UInput
                  v-model="sinceInput"
                  type="datetime-local"
                />
              </UFormField>

              <UFormField :label="t('audit.filters.until.label')">
                <UInput
                  v-model="untilInput"
                  type="datetime-local"
                />
              </UFormField>
            </div>
          </UCard>

          <UAlert
            v-if="error"
            color="error"
            variant="soft"
            icon="i-lucide-alert-circle"
            :title="t('audit.error.load')"
            :description="error.message"
          />

          <!-- Table -->
          <UCard>
            <template #header>
              <div class="flex items-center justify-between flex-wrap gap-2">
                <h2 class="text-lg font-semibold text-highlighted">
                  {{ t('audit.table.title') }}
                </h2>
                <div class="text-sm text-muted">
                  {{ t('audit.table.total', { total }) }}
                </div>
              </div>
            </template>

            <div v-if="isLoading && rows.length === 0" class="space-y-2">
              <USkeleton v-for="i in 5" :key="i" class="h-10 w-full" />
            </div>

            <div v-else-if="rows.length === 0" class="text-sm text-muted py-6 text-center">
              {{ t('audit.table.empty') }}
            </div>

            <div v-else class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead class="text-left text-muted">
                  <tr class="border-b border-default">
                    <th class="py-2 pr-3 font-medium">
                      {{ t('audit.columns.createdAt') }}
                    </th>
                    <th class="py-2 pr-3 font-medium">
                      {{ t('audit.columns.toolName') }}
                    </th>
                    <th class="py-2 pr-3 font-medium">
                      {{ t('audit.columns.class') }}
                    </th>
                    <th class="py-2 pr-3 font-medium">
                      {{ t('audit.columns.status') }}
                    </th>
                    <th class="py-2 pr-3 font-medium text-right">
                      {{ t('audit.columns.affectedCount') }}
                    </th>
                    <th class="py-2 pr-3 font-medium">
                      {{ t('audit.columns.model') }}
                    </th>
                    <th class="py-2 pr-3 font-medium">
                      {{ t('audit.columns.user') }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in rows"
                    :key="row.id"
                    class="border-b border-default hover:bg-accented cursor-pointer"
                    @click="openRow(row)"
                  >
                    <td class="py-2 pr-3 text-muted whitespace-nowrap font-mono text-xs">
                      {{ formatDateTime(row.createdAt) }}
                    </td>
                    <td class="py-2 pr-3 font-mono text-xs">
                      {{ row.toolName }}
                    </td>
                    <td class="py-2 pr-3">
                      <UBadge
                        :color="row.class === 'confirm' ? 'warning' : 'neutral'"
                        variant="subtle"
                        size="sm"
                      >
                        {{ t(`audit.class.${row.class}`) }}
                      </UBadge>
                    </td>
                    <td class="py-2 pr-3">
                      <UBadge
                        :color="statusColour(row.status)"
                        variant="subtle"
                        size="sm"
                      >
                        {{ t(`audit.status.${row.status}`) }}
                      </UBadge>
                    </td>
                    <td class="py-2 pr-3 text-right tabular-nums font-mono text-xs">
                      {{ row.affectedCount ?? '—' }}
                    </td>
                    <td class="py-2 pr-3 text-muted">
                      {{ row.model?.displayName ?? '—' }}
                    </td>
                    <td class="py-2 pr-3 font-mono text-xs text-muted">
                      {{ userShort(row.userId) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <template #footer>
              <div class="flex items-center justify-between flex-wrap gap-2">
                <div class="text-sm text-muted">
                  {{ t('audit.pagination.indicator', { page, totalPages }) }}
                </div>
                <div class="flex gap-2">
                  <UButton
                    variant="outline"
                    size="sm"
                    icon="i-lucide-chevron-left"
                    :label="t('audit.pagination.prev')"
                    :disabled="!canPrev"
                    @click="goPrev"
                  />
                  <UButton
                    variant="outline"
                    size="sm"
                    trailing-icon="i-lucide-chevron-right"
                    :label="t('audit.pagination.next')"
                    :disabled="!canNext"
                    @click="goNext"
                  />
                </div>
              </div>
            </template>
          </UCard>
        </template>

        <!-- Detail drawer -->
        <USlideover
          v-model:open="drawerOpen"
          :title="t('audit.detail.title')"
          side="right"
          @after:leave="closeDrawer"
        >
          <template #body>
            <div v-if="rowLoading && !activeRow" class="space-y-3">
              <USkeleton class="h-6 w-1/2" />
              <USkeleton class="h-32 w-full" />
            </div>
            <div v-else-if="activeRow" class="space-y-4 text-sm">
              <dl class="grid grid-cols-3 gap-x-3 gap-y-2">
                <dt class="text-muted">
                  {{ t('audit.columns.toolName') }}
                </dt>
                <dd class="col-span-2 font-mono text-xs">
                  {{ activeRow.toolName }}
                </dd>

                <dt class="text-muted">
                  {{ t('audit.columns.status') }}
                </dt>
                <dd class="col-span-2">
                  <UBadge :color="statusColour(activeRow.status)" variant="subtle" size="sm">
                    {{ t(`audit.status.${activeRow.status}`) }}
                  </UBadge>
                </dd>

                <dt class="text-muted">
                  {{ t('audit.columns.class') }}
                </dt>
                <dd class="col-span-2">
                  <UBadge
                    :color="activeRow.class === 'confirm' ? 'warning' : 'neutral'"
                    variant="subtle"
                    size="sm"
                  >
                    {{ t(`audit.class.${activeRow.class}`) }}
                  </UBadge>
                </dd>

                <dt class="text-muted">
                  {{ t('audit.columns.affectedCount') }}
                </dt>
                <dd class="col-span-2 tabular-nums font-mono text-xs">
                  {{ activeRow.affectedCount ?? '—' }}
                </dd>

                <dt class="text-muted">
                  {{ t('audit.columns.model') }}
                </dt>
                <dd class="col-span-2">
                  {{ activeRow.model?.displayName ?? '—' }}
                </dd>

                <dt class="text-muted">
                  {{ t('audit.columns.user') }}
                </dt>
                <dd class="col-span-2 font-mono text-xs">
                  {{ activeRow.userId ?? '—' }}
                </dd>

                <dt class="text-muted">
                  {{ t('audit.detail.conversation') }}
                </dt>
                <dd class="col-span-2 font-mono text-xs">
                  {{ activeRow.conversationTitle || activeRow.conversationId }}
                </dd>

                <dt class="text-muted">
                  {{ t('audit.detail.createdAt') }}
                </dt>
                <dd class="col-span-2 font-mono text-xs">
                  {{ formatDateTime(activeRow.createdAt) }}
                </dd>

                <template v-if="activeRow.executedAt">
                  <dt class="text-muted">
                    {{ t('audit.detail.executedAt') }}
                  </dt>
                  <dd class="col-span-2 font-mono text-xs">
                    {{ formatDateTime(activeRow.executedAt) }}
                  </dd>
                </template>

                <template v-if="activeRow.confirmedAt">
                  <dt class="text-muted">
                    {{ t('audit.detail.confirmedAt') }}
                  </dt>
                  <dd class="col-span-2 font-mono text-xs">
                    {{ formatDateTime(activeRow.confirmedAt) }}
                  </dd>
                </template>

                <template v-if="activeRow.cancelledAt">
                  <dt class="text-muted">
                    {{ t('audit.detail.cancelledAt') }}
                  </dt>
                  <dd class="col-span-2 font-mono text-xs">
                    {{ formatDateTime(activeRow.cancelledAt) }}
                  </dd>
                </template>
              </dl>

              <section>
                <h3 class="font-semibold text-highlighted mb-1">
                  {{ t('audit.detail.parameters') }}
                </h3>
                <pre class="bg-elevated rounded p-3 text-xs font-mono overflow-auto max-h-72">{{ formatJson(activeRow.parameters) }}</pre>
              </section>

              <section v-if="activeRow.result">
                <h3 class="font-semibold text-highlighted mb-1">
                  {{ t('audit.detail.result') }}
                </h3>
                <pre class="bg-elevated rounded p-3 text-xs font-mono overflow-auto max-h-72">{{ formatJson(activeRow.result) }}</pre>
              </section>

              <section v-if="activeRow.error">
                <h3 class="font-semibold text-error mb-1">
                  {{ t('audit.detail.error') }}
                </h3>
                <pre class="bg-error/10 rounded p-3 text-xs overflow-auto max-h-72">{{ activeRow.error }}</pre>
              </section>
            </div>
          </template>
        </USlideover>
      </div>
    </UPage>
  </UPage>
</template>
