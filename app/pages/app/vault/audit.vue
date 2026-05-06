<script setup lang="ts">
/**
 * Vault audit log view (T-V-29, REQ-VAULT-18, REQ-VAULT-19).
 *
 * Paginated read of `/api/vault/access-log` with event-type and
 * since-date filters. Renders the joined entry title when the row
 * references an entry.
 */
import { useQuery } from '@pinia/colada'

definePageMeta({ layout: 'app', auth: true })

interface AccessLogRow {
  id: string
  organisationId: string
  userId: string
  entryId: string | null
  eventType:
    | 'unlock'
    | 'lock'
    | 'auto_lock'
    | 'ui_reveal'
    | 'orchestrator_reveal'
    | 'orchestrator_search'
    | 'entry_create'
    | 'entry_update'
    | 'entry_delete'
  fieldName: string | null
  reason: string | null
  conversationId: string | null
  createdAt: string
  entryTitle: string | null
}

interface AccessLogResponse {
  data: AccessLogRow[]
  total: number
  limit: number
  offset: number
}

const { t } = useI18n()
const { $api } = useNuxtApp()

const eventType = ref<AccessLogRow['eventType'] | 'all'>('all')
const since = ref<string>('')
const offset = ref(0)
const limit = 50

const params = computed(() => {
  const q: Record<string, unknown> = { limit, offset: offset.value }
  if (eventType.value !== 'all')
    q.eventType = eventType.value
  if (since.value)
    q.since = new Date(since.value).toISOString()
  return q
})

const log = useQuery({
  key: () => ['vault', 'access-log', params.value] as const,
  query: (): Promise<AccessLogResponse> =>
    $api('/api/vault/access-log', { query: params.value }),
})

const eventOptions = computed<{ label: string, value: AccessLogRow['eventType'] | 'all' }[]>(() => [
  { label: t('vault.audit.filterEvent'), value: 'all' },
  { label: t('vault.audit.events.entry_create'), value: 'entry_create' },
  { label: t('vault.audit.events.entry_update'), value: 'entry_update' },
  { label: t('vault.audit.events.entry_delete'), value: 'entry_delete' },
  { label: t('vault.audit.events.ui_reveal'), value: 'ui_reveal' },
  { label: t('vault.audit.events.orchestrator_search'), value: 'orchestrator_search' },
  { label: t('vault.audit.events.orchestrator_reveal'), value: 'orchestrator_reveal' },
  { label: t('vault.audit.events.unlock'), value: 'unlock' },
  { label: t('vault.audit.events.lock'), value: 'lock' },
  { label: t('vault.audit.events.auto_lock'), value: 'auto_lock' },
])

const goPrev = () => {
  offset.value = Math.max(0, offset.value - limit)
}
const goNext = () => {
  if ((log.data.value?.total ?? 0) > offset.value + limit)
    offset.value += limit
}
</script>

<template>
  <div>
    <UDashboardToolbar>
      <template #left>
        <h1 class="text-base font-semibold">
          {{ t('vault.audit.pageTitle') }}
        </h1>
      </template>
    </UDashboardToolbar>

    <div class="p-6 max-w-5xl mx-auto space-y-4">
      <p class="text-sm text-muted">
        {{ t('vault.audit.subtitle') }}
      </p>

      <div class="flex flex-wrap gap-3 items-end">
        <UFormField :label="t('vault.audit.filterEvent')">
          <USelect v-model="eventType" :items="eventOptions" value-key="value" option-attribute="label" size="sm" />
        </UFormField>
        <UFormField :label="t('vault.audit.filterSince')">
          <UInput v-model="since" type="date" size="sm" />
        </UFormField>
      </div>

      <p v-if="log.isLoading.value" class="text-sm text-muted">
        {{ t('common.loading') }}
      </p>
      <p v-else-if="(log.data.value?.data.length ?? 0) === 0" class="text-sm text-muted">
        {{ t('vault.audit.empty') }}
      </p>
      <ul v-else class="divide-y divide-default border border-default rounded">
        <li
          v-for="row in log.data.value?.data ?? []"
          :key="row.id"
          class="px-3 py-2 flex items-start gap-3 text-sm"
        >
          <UBadge color="neutral" variant="soft" class="shrink-0 font-mono">
            {{ t(`vault.audit.events.${row.eventType}`) }}
          </UBadge>
          <div class="flex-1 min-w-0">
            <p class="text-default truncate">
              {{ row.entryTitle ?? '—' }}
              <span v-if="row.fieldName" class="text-muted"> · {{ row.fieldName }}</span>
            </p>
            <p v-if="row.reason" class="text-xs text-muted italic">
              "{{ row.reason }}"
            </p>
          </div>
          <p class="text-xs text-muted shrink-0">
            {{ new Date(row.createdAt).toLocaleString() }}
          </p>
        </li>
      </ul>

      <div class="flex justify-between items-center pt-2">
        <p class="text-xs text-muted">
          {{ offset + 1 }}–{{ Math.min(offset + limit, log.data.value?.total ?? 0) }} / {{ log.data.value?.total ?? 0 }}
        </p>
        <div class="flex gap-2">
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-chevron-left"
            :disabled="offset === 0"
            @click="goPrev"
          />
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-chevron-right"
            :disabled="(log.data.value?.total ?? 0) <= offset + limit"
            @click="goNext"
          />
        </div>
      </div>
    </div>
  </div>
</template>
