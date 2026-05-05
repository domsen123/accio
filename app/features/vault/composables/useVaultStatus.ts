import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { useVaultApi, vaultKeys } from '../api/vault.api'

/**
 * Polls /api/vault/status. Refreshed on a 30-second cadence so the lock
 * indicator's countdown can stay roughly correct without hammering the
 * server. Background pin disabled — REQ-VAULT-4 says "no vault API call
 * extends the timer", so a poll wouldn't reset auto-lock anyway.
 */
export const useVaultStatus = () => {
  const api = useVaultApi()
  return useQuery({
    key: vaultKeys.status(),
    query: () => api.getStatus(),
    staleTime: 15_000,
  })
}

export const useVaultUnlock = () => {
  const api = useVaultApi()
  const cache = useQueryCache()
  return useMutation({
    mutation: (body: { masterPassword: string }) => api.unlock(body),
    onSuccess: () => {
      cache.invalidateQueries({ key: ['vault'] })
    },
  })
}

export const useVaultLock = () => {
  const api = useVaultApi()
  const cache = useQueryCache()
  return useMutation({
    mutation: () => api.lock(),
    onSuccess: () => {
      cache.invalidateQueries({ key: ['vault'] })
    },
  })
}

export const useVaultSetup = () => {
  const api = useVaultApi()
  const cache = useQueryCache()
  return useMutation({
    mutation: (body: { masterPassword: string, acknowledgeIrrecoverable: true }) => api.setup(body),
    onSuccess: () => {
      cache.invalidateQueries({ key: vaultKeys.status() })
    },
  })
}

export const useVaultWorkspaceInit = () => {
  const api = useVaultApi()
  return useMutation({
    mutation: (body: { masterPassword: string }) => api.initWorkspace(body),
  })
}
