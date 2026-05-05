/**
 * Client-side types for the orchestrator conversation surface (T-3.13).
 *
 * Mirrors the server's serialiser output — see
 * `server/features/orchestrator/conversation-schemas.ts`. Keep the shapes
 * narrow: the chat handler persists structured content blocks in the AI SDK
 * shape (`{ type: 'text', text }`, `{ type: 'tool-call', ... }`,
 * `{ type: 'tool-result', ... }`); we expose a typed union so the chat view
 * can render text blocks directly and tool blocks as placeholders until
 * T-3.14 ships the proper cards.
 */

export type ConversationMode = 'read_only' | 'read_write'

export type ConversationSort
  = | 'updatedAt:desc'
    | 'updatedAt:asc'
    | 'createdAt:desc'
    | 'createdAt:asc'

export type ConversationMessageRole = 'user' | 'assistant' | 'tool_result'

// ─── Content blocks ────────────────────────────────────────────────────────
//
// The server stores AI SDK content blocks verbatim. We only model the shapes
// the chat-shell view actually inspects; anything else (vision parts, etc.)
// falls into the `unknown`-like default branch and renders as a placeholder.

export interface MessageTextBlock {
  type: 'text'
  text: string
}

export interface MessageToolCallBlock {
  type: 'tool-call'
  toolCallId?: string
  toolName: string
  input?: unknown
}

export interface MessageToolResultBlock {
  type: 'tool-result'
  toolCallId?: string
  toolName?: string
  output?: unknown
}

export type MessageContentBlock
  = | MessageTextBlock
    | MessageToolCallBlock
    | MessageToolResultBlock
    | { type: string, [k: string]: unknown }

export interface Conversation {
  id: string
  organisationId: string
  userId: string | null
  title: string
  mode: ConversationMode
  modelId: string | null
  systemPrompt: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface ConversationListItem extends Conversation {
  /** ISO 8601; null when the conversation has no messages yet. */
  lastMessageAt: string | null
}

export interface ConversationMessage {
  id: string
  conversationId: string
  role: ConversationMessageRole
  content: MessageContentBlock[] | unknown
  createdAt: string
}

// ─── List query / responses ────────────────────────────────────────────────

export interface ConversationListQuery {
  includeDeleted?: boolean
  limit?: number
  offset?: number
  sort?: ConversationSort
}

export interface ConversationListResponse {
  rows: ConversationListItem[]
  total: number
  limit: number
  offset: number
}

export interface ConversationDetailResponse {
  conversation: Conversation
  messages?: ConversationMessage[]
}

export interface ConversationMetaResponse {
  conversation: Conversation
}

export interface CreateConversationInput {
  title?: string
  mode?: ConversationMode
  modelId?: string | null
}

export interface UpdateConversationInput {
  title?: string
  mode?: ConversationMode
  modelId?: string | null
}
