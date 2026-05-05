// In-process MCP tool registry bootstrap (T-3.2).
//
// Refs: REQ-ORCH-2 (read-only set vs write set), DESIGN-TOOLS (tool contract
// shape), ADR-006 (in-process only — no HTTP transport, but follows the MCP
// shape so we *could* expose it later).
//
// This file is intentionally minimal: it defines the tool contract, the
// registry surface, and the invoke pipeline (validate → run → wrap-or-rethrow).
// Concrete tools (KB read, KB write, todo, project) are registered by later
// tasks (T-3.3 / T-3.4 / T-3.5). Confirmation enforcement (T-3.6), audit
// writes (T-3.7), and AI-SDK schema mapping (T-3.10) plug in on top of this
// surface — none of that lives here.

import type { z } from 'zod'

import {
  ConfirmationRequiredError,
  McpToolDuplicateError,
  McpToolError,
  McpToolExecutionError,
  McpToolInputError,
  McpToolNotFoundError,
} from './errors'

/**
 * Whether the model needs the user to confirm a call before the tool runs.
 * `auto` tools execute immediately; `confirm` tools throw a structured
 * `ConfirmationRequired` from the registry wrapper that T-3.6 will install.
 *
 * For the bootstrap (this task), `class` is just stored on the tool — the
 * confirm wrapper is added in T-3.6.
 */
export type ToolClass = 'auto' | 'confirm'

/**
 * Per-tool classification — either a static class declared on the tool, or a
 * function that derives the class from the parsed input. The function form
 * exists for tools whose class depends on input shape (e.g. `kb_create_entry`
 * is `auto` for `status='inbox'` but `confirm` for `draft`/`verified`); see
 * T-3.4 notes. T-3.6's confirmation wrapper resolves this to a static class
 * before deciding whether to short-circuit.
 */
export type ToolClassifier<I = unknown> = ToolClass | ((input: I) => ToolClass)

/**
 * Resolve a tool's class for a specific (already-parsed) input. Use this from
 * T-3.6's wrapper — it accepts both the static and dynamic forms uniformly.
 */
export const classifyTool = <I>(tool: Tool<I>, input: I): ToolClass =>
  typeof tool.class === 'function' ? tool.class(input) : tool.class

/**
 * Whether a tool reads from or writes to the workspace. The registry uses
 * this to filter the tool list per conversation mode (REQ-ORCH-2 /
 * REQ-ORCH-3): a `read_only` conversation only sees `read` tools.
 */
export type ToolMode = 'read' | 'write'

/**
 * Per-invocation context handed to every tool handler. The registry does NOT
 * bake service deps in here on purpose — the tool factories in T-3.3+ will
 * close over their service dependencies (kb service, todo service, …) at
 * construction time. The context only carries identifiers and the
 * conversation's runtime mode.
 */
export interface McpToolContext {
  organisationId: string
  userId: string
  /**
   * Auth session id for the active request. Required by vault tools
   * (T-V-20+) which key the in-memory master-key store on
   * `(userId, sessionId)`. Optional because non-vault tools and most tests
   * don't need it.
   */
  sessionId?: string
  conversationId?: string
  /**
   * The conversation's current mode. `read_only` conversations must not be
   * able to invoke `write` tools — `invoke` cross-checks this against the
   * tool's declared `mode`.
   */
  mode: 'read_only' | 'read_write'
  /**
   * Display name used for `author_name` when an AI write tool creates or
   * updates an entry (REQ-ORCH-7). Sourced from the conversation's selected
   * model display name; the chat handler (T-3.11) populates it. Optional so
   * existing read-only call sites need no change — write tools default to
   * `'AI'` when missing.
   */
  authorName?: string
  /**
   * Marks this invocation as the post-confirmation re-entry of a previously
   * gated `confirm`-class call (T-3.6). When present, `invoke` bypasses the
   * confirmation gate and runs the handler directly. Absent in fresh model
   * calls — the registry then throws {@link ConfirmationRequiredError} for
   * `confirm`-class tools so the chat handler (T-3.11) can prompt the user.
   *
   * The token's value carries no semantic meaning at the registry layer —
   * presence/absence is the gate. The chat handler is responsible for
   * cryptographic strength, expiry, and binding the token to a specific
   * pending tool call.
   */
  confirmationToken?: string
}

/**
 * Registry-level result envelope. Tools may return any structured payload;
 * the registry wraps it so future cross-cutting concerns (truncation, audit
 * tagging) have a stable place to attach without rewriting every handler.
 */
export interface McpToolResult<T = unknown> {
  toolName: string
  result: T
}

/**
 * The MCP-shaped tool contract (DESIGN-TOOLS). Mirrors the field names used
 * by the public MCP protocol (`name`, `description`, `input_schema`) so we
 * could later expose the registry over MCP transport without renaming.
 *
 * `I` is the parsed input type (i.e. `z.infer<typeof schema>`); `O` is the
 * handler's return type. Both default to `unknown` so the registry can store
 * heterogeneous tools in a single map.
 */
export interface Tool<I = unknown, O = unknown> {
  /** Stable identifier the model sees. Must be unique across the registry. */
  readonly name: string
  /** Human-readable description, fed to the model alongside the schema. */
  readonly description: string
  /** Zod v4 schema validating the tool's input. */
  readonly schema: z.ZodType<I>
  /**
   * Auto-execute or require user confirmation before running. May be a static
   * `ToolClass` or a function `(input) => ToolClass` for tools whose class is
   * input-dependent (T-3.4 — `kb_create_entry`'s `auto`-when-`inbox`-else-
   * `confirm` rule). Use {@link classifyTool} to resolve.
   */
  readonly class: ToolClassifier<I>
  /** Read-only or write — used to filter per conversation mode. */
  readonly mode: ToolMode
  /** Implementation. Receives the parsed input and the per-call context. */
  readonly handler: (input: I, ctx: McpToolContext) => Promise<O> | O
  /**
   * Optional bulk-impact hook (T-3.6 / ADR-010). Returns the number of
   * entities this invocation would touch. When the count is >=6 the
   * registry auto-promotes the call to `confirm`, regardless of the tool's
   * declared class. Default when omitted: `1` (the common single-entity
   * case). None of the current tools take bulk arrays — the hook exists so
   * future bulk variants can opt in without changing the registry.
   */
  readonly affectedCount?: (input: I) => number
}

/**
 * Result of {@link McpServer.classify} — the resolved class plus the inputs
 * that drove it. The chat handler (T-3.11) uses this to decide whether to
 * surface a `confirmation_required` event without throwing through `invoke`.
 */
export interface ToolClassification {
  effectiveClass: ToolClass
  /** `'class'` = the tool is intrinsically confirm; `'bulk'` = auto-promoted. */
  reason: 'class' | 'bulk'
  affectedCount: number
}

/**
 * Filter passed to `list`. Omit `mode` to get every tool.
 */
export interface ListFilter {
  mode?: ToolMode
}

/**
 * The registry instance returned by `createMcpServer`. Exported as a type so
 * tools and the chat handler can accept it without depending on the factory.
 */
export interface McpServer {
  register: <I, O>(tool: Tool<I, O>) => void
  list: (filter?: ListFilter) => ReadonlyArray<Tool>
  has: (name: string) => boolean
  get: (name: string) => Tool | undefined
  invoke: <O = unknown>(name: string, rawInput: unknown, ctx: McpToolContext) => Promise<McpToolResult<O>>
  /**
   * Resolve the effective class for a hypothetical call without running the
   * handler. Validates input via the tool's Zod schema (so the classifier
   * sees the same parsed shape `invoke` would). Throws the same registry
   * errors as `invoke` for unknown tools or schema failures.
   */
  classify: (name: string, rawInput: unknown, ctx?: McpToolContext) => ToolClassification
}

/** Threshold above which a call auto-promotes to `confirm` (DESIGN-CONF / ADR-010). */
const BULK_CONFIRM_THRESHOLD = 6

/**
 * Build a fresh tool registry. The orchestrator chat handler (T-3.11) will
 * instantiate one per request and register the appropriate tool set based on
 * the conversation's mode.
 *
 * TODO(T-3.11): wire into `server/utils/container.ts` if a singleton is
 * appropriate; for now, callers (and tests) construct directly.
 */
export const createMcpServer = (): McpServer => {
  const tools = new Map<string, Tool>()

  const register = <I, O>(tool: Tool<I, O>): void => {
    if (tools.has(tool.name)) {
      throw new McpToolDuplicateError(tool.name)
    }
    // Cast through `unknown` to drop the input-type generic — the registry
    // stores tools as `Tool<unknown, unknown>` and re-narrows via the schema
    // at invoke time.
    tools.set(tool.name, tool as unknown as Tool)
  }

  const list = (filter?: ListFilter): ReadonlyArray<Tool> => {
    const all = Array.from(tools.values())
    if (!filter?.mode)
      return all
    const wanted = filter.mode
    return all.filter(tool => tool.mode === wanted)
  }

  const has = (name: string): boolean => tools.has(name)

  const get = (name: string): Tool | undefined => tools.get(name)

  /**
   * Shared resolution path for `invoke` and `classify`: look up + Zod-parse.
   * Returns the typed tool plus the parsed input.
   */
  const resolveAndParse = (name: string, rawInput: unknown): { tool: Tool, input: unknown } => {
    const tool = tools.get(name)
    if (!tool) {
      throw new McpToolNotFoundError(name)
    }

    const parsed = tool.schema.safeParse(rawInput)
    if (!parsed.success) {
      // Zod v4 surfaces issues as `parsed.error.issues`. Map to a plain
      // shape so callers don't need a Zod dependency to introspect the error.
      const issues = parsed.error.issues.map(issue => ({
        path: issue.path,
        message: issue.message,
        code: issue.code,
      }))
      throw new McpToolInputError(name, issues)
    }

    return { tool, input: parsed.data }
  }

  /**
   * Compute the effective class + reason + affectedCount for a parsed input.
   * Pure: no side effects, no handler call. Shared by `invoke` (for the
   * confirmation gate) and `classify` (for the chat handler's
   * pre-flight check).
   */
  const resolveClassification = (tool: Tool, input: unknown): ToolClassification => {
    const declaredClass = classifyTool(tool, input)
    const affectedCount = tool.affectedCount?.(input) ?? 1
    if (affectedCount >= BULK_CONFIRM_THRESHOLD) {
      return { effectiveClass: 'confirm', reason: 'bulk', affectedCount }
    }
    return { effectiveClass: declaredClass, reason: 'class', affectedCount }
  }

  const invoke = async <O = unknown>(
    name: string,
    rawInput: unknown,
    ctx: McpToolContext,
  ): Promise<McpToolResult<O>> => {
    const { tool, input } = resolveAndParse(name, rawInput)
    const classification = resolveClassification(tool, input)

    // Confirmation gate (T-3.6 / DESIGN-CONF / ADR-010). A `confirm`-class
    // (or bulk-promoted) tool only runs when the chat handler has supplied
    // a `confirmationToken` on the context, signalling "the user clicked
    // Confirm in the UI". On a fresh call, throw a structured error that
    // bubbles unchanged through the catch-all below — the chat handler
    // (T-3.11) catches it, persists a pending tool call, and emits the
    // SSE `confirmation_required` event.
    if (classification.effectiveClass === 'confirm' && !ctx.confirmationToken) {
      throw new ConfirmationRequiredError({
        toolName: name,
        input,
        affectedCount: classification.affectedCount,
        reason: classification.reason,
      })
    }

    try {
      const result = await tool.handler(input, ctx)
      return { toolName: name, result: result as O }
    }
    catch (err) {
      // Typed registry/control-flow errors (incl. ConfirmationRequiredError)
      // pass through unchanged — the chat handler matches by class name.
      if (err instanceof McpToolError)
        throw err
      throw new McpToolExecutionError(name, err)
    }
  }

  const classify = (name: string, rawInput: unknown): ToolClassification => {
    const { tool, input } = resolveAndParse(name, rawInput)
    return resolveClassification(tool, input)
  }

  return { register, list, has, get, invoke, classify }
}
