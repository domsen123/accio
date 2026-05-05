/**
 * Pinia Colada queries for the orchestrator audit log (T-3.8).
 *
 * `useAuditList(params)` watches the params ref and re-fetches on change;
 * `useAuditRow(id)` fetches a single row for the detail drawer (only when
 * the id is non-null, so the drawer's open/close drives the lifecycle).
 */
import type { MaybeRefOrGetter } from 'vue'
import type { AuditListQuery } from '../types/audit.types'
import { useQuery } from '@pinia/colada'
import { computed, toValue } from 'vue'
import { auditKeys, useAuditApi } from '../api/audit'

export const useAuditList = (params: MaybeRefOrGetter<AuditListQuery>) => {
  const auditApi = useAuditApi()

  const query = useQuery({
    key: () => auditKeys.list(toValue(params)),
    query: () => auditApi.list(toValue(params)),
    staleTime: 15 * 1000,
  })

  const rows = computed(() => query.data.value?.rows ?? [])
  const total = computed(() => query.data.value?.total ?? 0)
  const limit = computed(() => query.data.value?.limit ?? 50)
  const offset = computed(() => query.data.value?.offset ?? 0)

  return {
    ...query,
    rows,
    total,
    limit,
    offset,
  }
}

export const useAuditRow = (id: MaybeRefOrGetter<string | null>) => {
  const auditApi = useAuditApi()

  const query = useQuery({
    key: () => auditKeys.detail(toValue(id) ?? ''),
    query: () => auditApi.findById(toValue(id) as string),
    enabled: () => Boolean(toValue(id)),
    staleTime: 30 * 1000,
  })

  const row = computed(() => query.data.value?.row ?? null)

  return {
    ...query,
    row,
  }
}
