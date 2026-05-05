import type { McpToolContext, Tool } from '../server/features/orchestrator/mcp-server'
import { describe, expect, it, vi } from 'vitest'

import { z } from 'zod'
import {
  McpToolDuplicateError,
  McpToolError,
  McpToolExecutionError,
  McpToolInputError,
  McpToolNotFoundError,
} from '../server/features/orchestrator/errors'
import {
  classifyTool,
  createMcpServer,
} from '../server/features/orchestrator/mcp-server'

// Pure-unit tests for the MCP registry bootstrap (T-3.2). No DB, no AI SDK —
// just register a stub tool, invoke it, assert. Cleans up after itself by
// scoping each registry to its own `it` block.

const baseCtx: McpToolContext = {
  organisationId: 'org-test',
  userId: 'user-test',
  conversationId: 'conv-test',
  mode: 'read_write',
}

const echoSchema = z.object({ value: z.string().trim() })

const makeEchoTool = (overrides: Partial<Tool<{ value: string }, { echoed: string }>> = {}): Tool<{ value: string }, { echoed: string }> => ({
  name: 'echo',
  description: 'Returns the input value verbatim.',
  schema: echoSchema,
  class: 'auto',
  mode: 'read',
  handler: input => ({ echoed: input.value }),
  ...overrides,
})

describe('createMcpServer', () => {
  it('registers a read tool and lists it under the read filter only', () => {
    const server = createMcpServer()
    server.register(makeEchoTool())

    expect(server.has('echo')).toBe(true)
    expect(server.list().map(t => t.name)).toEqual(['echo'])
    expect(server.list({ mode: 'read' }).map(t => t.name)).toEqual(['echo'])
    expect(server.list({ mode: 'write' })).toEqual([])
  })

  it('lists read and write tools separately when filtered', () => {
    const server = createMcpServer()
    server.register(makeEchoTool())
    server.register(makeEchoTool({
      name: 'mutate',
      class: 'confirm',
      mode: 'write',
      handler: input => ({ echoed: input.value }),
    }))

    expect(server.list({ mode: 'read' }).map(t => t.name)).toEqual(['echo'])
    expect(server.list({ mode: 'write' }).map(t => t.name)).toEqual(['mutate'])
    expect(server.list().map(t => t.name).sort()).toEqual(['echo', 'mutate'])
  })

  it('invokes a tool with the parsed input and the supplied context', async () => {
    const server = createMcpServer()
    const handler = vi.fn((input: { value: string }, ctx: McpToolContext) => ({
      echoed: input.value,
      ctxOrg: ctx.organisationId,
    }))
    server.register(makeEchoTool({ handler }))

    const result = await server.invoke('echo', { value: 'hello' }, baseCtx)

    expect(result.toolName).toBe('echo')
    expect(result.result).toEqual({ echoed: 'hello', ctxOrg: 'org-test' })
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith({ value: 'hello' }, baseCtx)
  })

  it('throws McpToolInputError on schema-invalid input and never calls the handler', async () => {
    const server = createMcpServer()
    const handler = vi.fn(() => ({ echoed: 'unreachable' }))
    server.register(makeEchoTool({ handler }))

    await expect(server.invoke('echo', { value: 42 }, baseCtx))
      .rejects
      .toBeInstanceOf(McpToolInputError)

    expect(handler).not.toHaveBeenCalled()
  })

  it('throws McpToolNotFoundError when invoking an unknown tool name', async () => {
    const server = createMcpServer()

    await expect(server.invoke('does-not-exist', {}, baseCtx))
      .rejects
      .toBeInstanceOf(McpToolNotFoundError)
  })

  it('throws McpToolDuplicateError when registering the same name twice', () => {
    const server = createMcpServer()
    server.register(makeEchoTool())

    expect(() => server.register(makeEchoTool())).toThrow(McpToolDuplicateError)
  })

  it('wraps a plain Error from a handler in McpToolExecutionError with the original on .cause', async () => {
    const server = createMcpServer()
    const cause = new Error('handler boom')
    server.register(makeEchoTool({
      handler: () => { throw cause },
    }))

    const promise = server.invoke('echo', { value: 'x' }, baseCtx)
    await expect(promise).rejects.toBeInstanceOf(McpToolExecutionError)
    await promise.catch((err: McpToolExecutionError) => {
      expect(err.toolName).toBe('echo')
      expect((err as { cause?: unknown }).cause).toBe(cause)
    })
  })

  it('tool.class accepts both static ToolClass and a (input) => ToolClass function (T-3.4)', () => {
    // Static form (the existing default).
    const stat = makeEchoTool({ class: 'auto' })
    expect(classifyTool(stat, { value: 'x' })).toBe('auto')

    // Function form: derive class from input.
    const dyn = makeEchoTool({
      name: 'dyn',
      class: (input: { value: string }) => (input.value === 'cheap' ? 'auto' : 'confirm'),
    })
    expect(classifyTool(dyn, { value: 'cheap' })).toBe('auto')
    expect(classifyTool(dyn, { value: 'expensive' })).toBe('confirm')

    // Registry accepts both forms without complaint.
    const server = createMcpServer()
    server.register(stat)
    server.register(dyn)
    expect(server.has('echo')).toBe(true)
    expect(server.has('dyn')).toBe(true)
  })

  it('lets McpToolError subclasses bubble out of the handler unchanged (T-3.6 confirmation path)', async () => {
    // Stand-in for the `ConfirmationRequired` subclass T-3.6 will introduce —
    // this test guarantees the registry will not swallow it.
    class FakeConfirmationRequired extends McpToolError {
      readonly toolName: string
      constructor(toolName: string) {
        super(`confirmation required for ${toolName}`)
        this.name = 'FakeConfirmationRequired'
        this.toolName = toolName
      }
    }

    const server = createMcpServer()
    server.register(makeEchoTool({
      name: 'pending',
      class: 'confirm',
      mode: 'write',
      handler: () => { throw new FakeConfirmationRequired('pending') },
    }))

    // T-3.6: a fresh `confirm`-class call would now throw the registry's own
    // `ConfirmationRequiredError` before the handler runs. We pass a token to
    // bypass the gate so this test continues to assert the original property:
    // a handler-thrown McpToolError subclass bubbles out un-wrapped.
    const promise = server.invoke('pending', { value: 'x' }, { ...baseCtx, confirmationToken: 'test-confirmed' })
    await expect(promise).rejects.toBeInstanceOf(FakeConfirmationRequired)
    // Critical: must NOT be re-wrapped in McpToolExecutionError.
    await expect(promise).rejects.not.toBeInstanceOf(McpToolExecutionError)
  })
})
