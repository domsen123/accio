// Domain errors for the in-process MCP tool registry (T-3.2).
//
// All errors thrown by `mcpServer.invoke` extend `McpToolError`. Future tasks
// (T-3.6 confirmation, T-3.7 audit) will add subclasses (`ConfirmationRequired`,
// etc.) — those subclasses pass through `invoke` unchanged so the chat handler
// can pattern-match on them.
//
// Plain `Error` instances thrown from inside a handler are wrapped in
// `McpToolExecutionError` with the original on `.cause`, so unexpected handler
// failures never look like validation/registry bugs to callers.

/**
 * Base class for every error the MCP registry throws. Keeping a common
 * ancestor lets the registry distinguish between "expected control-flow
 * errors" (which propagate untouched) and "unexpected handler crashes"
 * (which get wrapped in `McpToolExecutionError`).
 */
export class McpToolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'McpToolError'
  }
}

/**
 * Thrown by `invoke` when the supplied tool name is not registered.
 */
export class McpToolNotFoundError extends McpToolError {
  readonly toolName: string
  constructor(toolName: string) {
    super(`MCP tool "${toolName}" is not registered`)
    this.name = 'McpToolNotFoundError'
    this.toolName = toolName
  }
}

/**
 * Thrown by `invoke` when the supplied input fails the tool's Zod schema.
 * Carries the Zod issues so callers can surface field-level messages.
 */
export class McpToolInputError extends McpToolError {
  readonly toolName: string
  readonly issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>, message: string, code?: string }>
  constructor(toolName: string, issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>, message: string, code?: string }>) {
    super(`Invalid input for MCP tool "${toolName}"`)
    this.name = 'McpToolInputError'
    this.toolName = toolName
    this.issues = issues
  }
}

/**
 * Wraps an unexpected error thrown from inside a tool handler. The original
 * error is preserved on `.cause`. Typed `McpToolError` subclasses thrown by a
 * handler are NOT wrapped — they bubble out so T-3.6's `ConfirmationRequired`
 * (and similar) can be caught by name in the chat handler.
 */
export class McpToolExecutionError extends McpToolError {
  readonly toolName: string
  constructor(toolName: string, cause: unknown) {
    super(`MCP tool "${toolName}" execution failed`)
    this.name = 'McpToolExecutionError'
    this.toolName = toolName
    // `Error.cause` is standard since ES2022; assign explicitly so the type is
    // narrow regardless of `lib` settings.
    ;(this as { cause?: unknown }).cause = cause
  }
}

/**
 * Thrown by `register` when a tool with the same name has already been
 * registered. Names are the public identifier the model sees, so silent
 * overrides would be a foot-gun.
 */
export class McpToolDuplicateError extends McpToolError {
  readonly toolName: string
  constructor(toolName: string) {
    super(`MCP tool "${toolName}" is already registered`)
    this.name = 'McpToolDuplicateError'
    this.toolName = toolName
  }
}

/**
 * Thrown by `invoke` when a tool is `confirm`-class (or auto-promoted to
 * `confirm` by the bulk rule) and the per-call context did not supply a
 * `confirmationToken`. Bubbles unchanged through `invoke` because it extends
 * {@link McpToolError}; the chat handler (T-3.11) catches it, persists a
 * pending tool call, and emits an SSE `confirmation_required` event. After
 * the user clicks Confirm, the chat handler re-invokes the same tool with
 * `ctx.confirmationToken` set and the gate is bypassed.
 *
 * `reason` distinguishes "tool is intrinsically confirm" (`'class'`) from
 * "auto-promoted because >=6 entities would be touched" (`'bulk'`) so the UI
 * can phrase the prompt accordingly.
 */
export class ConfirmationRequiredError extends McpToolError {
  readonly toolName: string
  readonly toolClass: 'confirm'
  readonly input: unknown
  readonly affectedCount: number
  readonly reason: 'class' | 'bulk'
  constructor(args: { toolName: string, input: unknown, affectedCount: number, reason: 'class' | 'bulk' }) {
    super(`MCP tool "${args.toolName}" requires user confirmation (${args.reason})`)
    this.name = 'ConfirmationRequiredError'
    this.toolName = args.toolName
    this.toolClass = 'confirm'
    this.input = args.input
    this.affectedCount = args.affectedCount
    this.reason = args.reason
  }
}

// ─── Conversation CRUD errors (T-3.9) ──────────────────────────────────────
//
// These are thrown by `conversationsService` (CRUD slice for
// `orchestrator_conversations`) and caught by the API layer in
// `api-utils.ts` to map onto stable HTTP error codes (ADR-012).

/**
 * Thrown when a conversation lookup misses — either the id does not exist or
 * it belongs to a different organisation. We deliberately do not distinguish
 * the two at the API boundary (no existence leak across workspaces).
 */
export class OrchestratorConversationNotFoundError extends Error {
  readonly conversationId: string
  constructor(conversationId: string) {
    super(`Orchestrator conversation "${conversationId}" not found`)
    this.name = 'OrchestratorConversationNotFoundError'
    this.conversationId = conversationId
  }
}

/**
 * Thrown when create / update receives a `modelId` that fails capability
 * validation (DESIGN-AI §Capability validation): row absent, disabled, or
 * lacking the `supports_tools` / `supports_streaming` flags the orchestrator
 * requires. `reason` lets the API surface a precise client message.
 */
export type OrchestratorModelInvalidReason = 'not_found' | 'disabled' | 'lacks_tools' | 'lacks_streaming'

export class OrchestratorModelInvalidError extends Error {
  readonly modelId: string
  readonly reason: OrchestratorModelInvalidReason
  constructor(modelId: string, reason: OrchestratorModelInvalidReason) {
    super(`AI model "${modelId}" cannot be used by the orchestrator (${reason})`)
    this.name = 'OrchestratorModelInvalidError'
    this.modelId = modelId
    this.reason = reason
  }
}

/**
 * Thrown by a tool handler when the targeted entity (KB entry, todo, …) does
 * not exist in the caller's workspace. Distinct from
 * {@link McpToolNotFoundError} (which signals an unknown *tool name*) so the
 * chat handler / UI can disambiguate "the model called a bogus tool" from
 * "the model asked for a row that isn't there".
 *
 * Bubbles through `invoke` unchanged because it extends {@link McpToolError}.
 */
export class McpToolNotFoundEntityError extends McpToolError {
  readonly toolName: string
  readonly entityType: string
  readonly identifier: string
  constructor(toolName: string, entityType: string, identifier: string) {
    super(`${entityType} "${identifier}" not found`)
    this.name = 'McpToolNotFoundEntityError'
    this.toolName = toolName
    this.entityType = entityType
    this.identifier = identifier
  }
}
