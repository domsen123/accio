/**
 * Typed `$fetch` wrappers for the orchestrator conversation CRUD API (T-3.13).
 *
 * Mirrors `app/features/orchestrator/api/audit.ts`: a `useConversationsApi()`
 * factory grabs the SSR-aware `$api` from `useNuxtApp()` so cookies forward
 * during SSR. Workspace context is injected via the `X-Organisation-Id`
 * header / query fallback handled server-side.
 */
import type {
  ConversationDetailResponse,
  ConversationListQuery,
  ConversationListResponse,
  ConversationMetaResponse,
  CreateConversationInput,
  UpdateConversationInput,
} from '../types/conversation.types'

const buildListQuery = (params: ConversationListQuery): Record<string, unknown> => {
  const q: Record<string, unknown> = {}
  if (typeof params.includeDeleted === 'boolean')
    q.includeDeleted = params.includeDeleted ? '1' : '0'
  if (typeof params.limit === 'number')
    q.limit = params.limit
  if (typeof params.offset === 'number')
    q.offset = params.offset
  if (params.sort)
    q.sort = params.sort
  return q
}

export const useConversationsApi = () => {
  const { $api } = useNuxtApp()

  return {
    list: (params: ConversationListQuery = {}): Promise<ConversationListResponse> =>
      $api('/api/orchestrator/conversations', { query: buildListQuery(params) }),

    get: (
      id: string,
      opts: { includeMessages?: boolean } = {},
    ): Promise<ConversationDetailResponse> =>
      $api(String(`/api/orchestrator/conversations/${id}`), {
        query: typeof opts.includeMessages === 'boolean'
          ? { includeMessages: opts.includeMessages ? '1' : '0' }
          : undefined,
      }),

    create: (input: CreateConversationInput = {}): Promise<ConversationMetaResponse> =>
      $api('/api/orchestrator/conversations', {
        method: 'POST',
        body: input,
      }),

    update: (
      id: string,
      input: UpdateConversationInput,
    ): Promise<ConversationMetaResponse> =>
      $api(String(`/api/orchestrator/conversations/${id}`), {
        method: 'PATCH',
        body: input,
      }),

    softDelete: (id: string): Promise<{ success: true }> =>
      $api(String(`/api/orchestrator/conversations/${id}`), {
        method: 'DELETE',
      }),
  }
}

// ─── Streaming endpoint helpers (T-3.15) ───────────────────────────────────
//
// `useChatStream` consumes the body itself; these helpers just emit the right
// URL path so the page / composables don't repeat the path string. The body
// shapes match the route schemas (`messages.post.ts: { content }`,
// `confirm.post.ts: { actionId }`, `cancel.post.ts: { actionId }`).

export const orchestratorStreamPaths = {
  messages: (conversationId: string): string =>
    `/api/orchestrator/conversations/${conversationId}/messages`,
  confirm: (conversationId: string): string =>
    `/api/orchestrator/conversations/${conversationId}/confirm`,
  cancel: (conversationId: string): string =>
    `/api/orchestrator/conversations/${conversationId}/cancel`,
}

export const conversationKeys = {
  all: ['orchestrator', 'conversations'] as const,
  list: (params: ConversationListQuery) =>
    ['orchestrator', 'conversations', 'list', params] as const,
  detail: (id: string) =>
    ['orchestrator', 'conversations', 'detail', id] as const,
}
