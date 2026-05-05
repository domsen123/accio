// Orchestrator AI client (T-3.10).
//
// Refs: REQ-ORCH-2/3 (mode-gated tool sets), REQ-ORCH-7 (author propagation),
// DESIGN-AI §Provider-Model resolution flow, DESIGN-CHAT step 4 (model picks
// tool, the chat handler audits + executes).
//
// Responsibilities:
//   1. `resolveForConversation` — load the conversation, resolve its modelId
//      (with the workspace/global default fallback chain), build a fresh AI
//      SDK model client, and resolve the `authorName` used by KB write tools.
//   2. `streamChat` — build the AI SDK `tools` map from the in-process MCP
//      registry filtered by conversation mode, then return the value of
//      `streamText({ model, messages, tools, system, abortSignal })` verbatim
//      so the chat handler (T-3.11) can iterate `fullStream` for text and
//      tool-call deltas without re-implementing.
//
// Loop style — MANUAL.
// We expose the tools to the model with `description` + `inputSchema` only, no
// `execute`. The chat handler reads `tool-call` chunks off `fullStream` and
// runs `auditedInvoke` itself, which (a) returns either `executed` or
// `confirmation_required` and (b) writes the audit row. The AI SDK's auto-
// execute path can't pause mid-stream for a user confirmation, so it would
// fight `auditedInvoke` rather than complement it. T-3.11 then feeds tool
// results back as a `ToolModelMessage` on the next turn.

import type { LanguageModelV3 } from '@ai-sdk/provider'
import type { ModelMessage, ToolSet } from 'ai'
import type { AiModel, OrchestratorConversation } from '../../database/schema'
import type { AiProviderService } from '../ai/provider'
import type { ConversationsService } from './conversations.service'
import type { McpServer, McpToolContext } from './mcp-server'

import { streamText } from 'ai'

// ─── Public types ───────────────────────────────────────────────────────────

export interface ResolveForConversationArgs {
  conversationId: string
  organisationId: string
}

export interface ResolvedConversationModel {
  conversation: OrchestratorConversation
  /** Fresh AI SDK model instance — never cached. */
  modelClient: LanguageModelV3
  /** The `ai_models` row that produced the client. Drives audit + display. */
  modelRow: AiModel
  /** Stable provider key (`anthropic` | `openai` | `google` | …). */
  providerKey: string
  /**
   * Display name used for KB `author_name` when an AI write tool creates or
   * updates an entry (REQ-ORCH-7). Sources, in order:
   *   1. `orchestrator_workspace_settings.ai_display_name` (per-workspace).
   *   2. `ai_models.display_name` (the resolved model).
   * The chat handler (T-3.11) puts this on `McpToolContext.authorName`.
   */
  authorName: string
}

export interface StreamChatArgs {
  conversation: OrchestratorConversation
  modelClient: LanguageModelV3
  /** Conversation history in AI SDK shape. The chat handler builds this. */
  messages: ModelMessage[]
  /**
   * Per-call MCP context. Not used here directly — kept on the args so a
   * future variant that *does* wire `execute` can hand it to the registry.
   * The chat handler passes the same value into `auditedInvoke` for actual
   * execution. Marked unused-but-required so the public surface stays stable.
   */
  toolContext: McpToolContext
  systemPrompt?: string
  abortSignal?: AbortSignal
}

export interface StreamChatResult {
  /**
   * The AI SDK's `streamText` return value — pass-through. The chat handler
   * iterates `result.stream.fullStream` for text deltas, tool-call deltas,
   * step lifecycle, etc.
   */
  stream: ReturnType<typeof streamText>
  /** Tool names that were exposed to the model on this call. */
  toolsRegistered: string[]
}

export interface OrchestratorAiClient {
  resolveForConversation: (args: ResolveForConversationArgs) => Promise<ResolvedConversationModel>
  streamChat: (args: StreamChatArgs) => StreamChatResult
}

export interface CreateOrchestratorAiClientDeps {
  aiProviderService: AiProviderService
  conversationsService: ConversationsService
  /**
   * The MCP registry with the appropriate tool set already registered.
   *
   * TODO(T-3.11): the chat handler will construct this per request (registry
   * is request-scoped — it carries no DB state). For now, it's a constructor
   * dep so tests can hand in a pre-populated server. The container wiring
   * may be replaced by a per-request factory once T-3.11 lands.
   */
  mcpServer: McpServer
}

// ─── Implementation ─────────────────────────────────────────────────────────

export const createOrchestratorAiClient = (
  deps: CreateOrchestratorAiClientDeps,
): OrchestratorAiClient => {
  const { aiProviderService, conversationsService, mcpServer } = deps

  const resolveForConversation = async (
    args: ResolveForConversationArgs,
  ): Promise<ResolvedConversationModel> => {
    // 1. Load the conversation. `get` throws OrchestratorConversationNotFoundError
    //    for unknown ids OR cross-org access — we let it bubble (uniform 404).
    const { conversation } = await conversationsService.get({
      id: args.conversationId,
      organisationId: args.organisationId,
      includeMessages: false,
    })

    // 2. Resolve the model id — conversation override wins, else workspace/global
    //    default fallback chain owned by aiProviderService (DESIGN-AI).
    const modelId = conversation.modelId
      ?? (await aiProviderService.getDefaultModel({ organisationId: args.organisationId })).id

    // 3. Build a fresh SDK client + decrypt the workspace's API key.
    const { model, modelRow, providerKey } = await aiProviderService.resolveModelClient({
      organisationId: args.organisationId,
      modelId,
    })

    // 4. Resolve the author name (REQ-ORCH-7). Workspace override > model
    //    display name. `getWorkspaceSettings` is create-on-read, so we always
    //    get a row — the column has a non-null default.
    const settings = await aiProviderService.getWorkspaceSettings({ organisationId: args.organisationId })
    const authorName = settings.aiDisplayName?.trim() || modelRow.displayName

    return {
      conversation,
      modelClient: model,
      modelRow,
      providerKey,
      authorName,
    }
  }

  const streamChat = (args: StreamChatArgs): StreamChatResult => {
    // 1. Filter tools by conversation mode (REQ-ORCH-2 / REQ-ORCH-3).
    //    `read_only` conversations only see `read` tools; `read_write`
    //    conversations see read + write.
    const exposed = args.conversation.mode === 'read_only'
      ? mcpServer.list({ mode: 'read' })
      : mcpServer.list()

    // 2. Build the AI SDK ToolSet — description + inputSchema only, no
    //    `execute`. See file header for the manual-loop rationale. The AI SDK
    //    accepts a Zod v4 schema directly via `FlexibleSchema`.
    const tools: ToolSet = Object.fromEntries(
      exposed.map(t => [
        t.name,
        {
          description: t.description,
          inputSchema: t.schema,
        },
      ]),
    )

    // 3. Hand off to streamText. We pass `args.toolContext` through
    //    `experimental_context` so the chat handler can pick it up alongside
    //    tool-call chunks if needed; but tool execution itself is the chat
    //    handler's job (`auditedInvoke`).
    const stream = streamText({
      model: args.modelClient,
      messages: args.messages,
      system: args.systemPrompt,
      tools,
      abortSignal: args.abortSignal,
      experimental_context: args.toolContext,
    })

    return {
      stream,
      toolsRegistered: exposed.map(t => t.name),
    }
  }

  return { resolveForConversation, streamChat }
}
