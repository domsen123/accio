/**
 * Pinia Colada queries + mutations for orchestrator conversations (T-3.13).
 *
 * `useConversationList(params)` watches the params ref and re-fetches on
 * change; `useConversation(id)` fetches a single conversation with its
 * messages — only when the id is non-null (so the chat page's mounting
 * drives the lifecycle). Mutations centralise invalidation through a small
 * helper so list + detail stay coherent after any write.
 */
import type { MaybeRefOrGetter } from 'vue'
import type {
  Conversation,
  ConversationDetailResponse,
  ConversationListQuery,
  ConversationMetaResponse,
  CreateConversationInput,
  UpdateConversationInput,
} from '../types/conversation.types'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { computed, toValue } from 'vue'
import { conversationKeys, useConversationsApi } from '../api/conversations'

export const useConversationList = (
  params: MaybeRefOrGetter<ConversationListQuery>,
) => {
  const api = useConversationsApi()

  const query = useQuery({
    key: () => conversationKeys.list(toValue(params)),
    query: () => api.list(toValue(params)),
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

export const useConversation = (id: MaybeRefOrGetter<string | null>) => {
  const api = useConversationsApi()

  const query = useQuery({
    key: () => conversationKeys.detail(toValue(id) ?? ''),
    query: () => api.get(toValue(id) as string, { includeMessages: true }),
    enabled: () => Boolean(toValue(id)),
    staleTime: 5 * 1000,
  })

  const conversation = computed<Conversation | null>(
    () => query.data.value?.conversation ?? null,
  )
  const messages = computed(() => query.data.value?.messages ?? [])

  return {
    ...query,
    conversation,
    messages,
  }
}

const invalidate = (
  queryCache: ReturnType<typeof useQueryCache>,
  conversation: Conversation | undefined,
) => {
  queryCache.invalidateQueries({ key: conversationKeys.all })
  if (conversation?.id)
    queryCache.invalidateQueries({ key: conversationKeys.detail(conversation.id) })
}

export const useCreateConversation = () => {
  const queryCache = useQueryCache()
  const api = useConversationsApi()

  return useMutation({
    mutation: (input: CreateConversationInput = {}): Promise<ConversationMetaResponse> =>
      api.create(input),
    onSuccess: ({ conversation }) => {
      invalidate(queryCache, conversation)
    },
  })
}

export const useUpdateConversation = () => {
  const queryCache = useQueryCache()
  const api = useConversationsApi()

  return useMutation({
    mutation: ({ id, data }: { id: string, data: UpdateConversationInput }): Promise<ConversationMetaResponse> =>
      api.update(id, data),
    onSuccess: ({ conversation }) => {
      invalidate(queryCache, conversation)
    },
  })
}

export const useDeleteConversation = () => {
  const queryCache = useQueryCache()
  const api = useConversationsApi()

  return useMutation({
    mutation: (id: string): Promise<{ success: true } & { id: string }> =>
      api.softDelete(id).then(res => ({ ...res, id })),
    onSuccess: () => {
      invalidate(queryCache, undefined)
    },
  })
}

export type { ConversationDetailResponse, ConversationMetaResponse }
