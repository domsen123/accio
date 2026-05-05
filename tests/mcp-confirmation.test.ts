import type { McpToolContext, Tool } from '../server/features/orchestrator/mcp-server'
import { describe, expect, it, vi } from 'vitest'

import { z } from 'zod'
import {
  ConfirmationRequiredError,
  McpToolError,
} from '../server/features/orchestrator/errors'
import { createMcpServer } from '../server/features/orchestrator/mcp-server'

// Pure-unit tests for T-3.6's confirmation gate. No DB, no AI SDK — just
// register a stub tool, assert the wrapper's behaviour around the
// `effectiveClass` decision and the `confirmationToken` bypass.

const baseCtx: McpToolContext = {
  organisationId: 'org-test',
  userId: 'user-test',
  conversationId: 'conv-test',
  mode: 'read_write',
}

const writeSchema = z.object({ value: z.string().trim() })

interface WriteInput { value: string }
interface WriteOutput { wrote: string }

const makeWriteTool = (overrides: Partial<Tool<WriteInput, WriteOutput>> = {}): Tool<WriteInput, WriteOutput> => ({
  name: 'write_thing',
  description: 'Pretends to write a thing.',
  schema: writeSchema,
  class: 'auto',
  mode: 'write',
  handler: input => ({ wrote: input.value }),
  ...overrides,
})

describe('mcp confirmation gate (T-3.6)', () => {
  it('runs an auto-class tool through invoke without requiring a token', async () => {
    const handler = vi.fn((input: WriteInput) => ({ wrote: input.value }))
    const server = createMcpServer()
    server.register(makeWriteTool({ class: 'auto', handler }))

    const r = await server.invoke<WriteOutput>('write_thing', { value: 'ok' }, baseCtx)
    expect(r.result).toEqual({ wrote: 'ok' })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('throws ConfirmationRequiredError for a static confirm-class tool with no token; handler not called', async () => {
    const handler = vi.fn()
    const server = createMcpServer()
    server.register(makeWriteTool({ class: 'confirm', handler }))

    const promise = server.invoke('write_thing', { value: 'data' }, baseCtx)
    await expect(promise).rejects.toBeInstanceOf(ConfirmationRequiredError)
    await expect(promise).rejects.toBeInstanceOf(McpToolError)

    await promise.catch((err: ConfirmationRequiredError) => {
      expect(err.toolName).toBe('write_thing')
      expect(err.toolClass).toBe('confirm')
      expect(err.reason).toBe('class')
      expect(err.affectedCount).toBe(1)
      // Carries the validated post-Zod input (whitespace trimmed by schema).
      expect(err.input).toEqual({ value: 'data' })
    })
    expect(handler).not.toHaveBeenCalled()
  })

  it('runs the confirm-class handler when ctx.confirmationToken is present', async () => {
    const handler = vi.fn((input: WriteInput) => ({ wrote: input.value }))
    const server = createMcpServer()
    server.register(makeWriteTool({ class: 'confirm', handler }))

    const r = await server.invoke<WriteOutput>(
      'write_thing',
      { value: 'go' },
      { ...baseCtx, confirmationToken: 'abc' },
    )
    expect(r.result).toEqual({ wrote: 'go' })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('honours a dynamic classifier (kb_create_entry-shaped): inbox=auto, verified=confirm', async () => {
    interface KbInput { title: string, status?: 'inbox' | 'draft' | 'verified' }
    const schema = z.object({ title: z.string().trim(), status: z.enum(['inbox', 'draft', 'verified']).optional() })
    const handler = vi.fn((input: KbInput) => ({ created: input.title, status: input.status ?? 'inbox' }))
    const tool: Tool<KbInput, { created: string, status: string }> = {
      name: 'fake_kb_create',
      description: 'mimics kb_create_entry classifier',
      schema,
      class: input => (input.status && input.status !== 'inbox' ? 'confirm' : 'auto'),
      mode: 'write',
      handler,
    }
    const server = createMcpServer()
    server.register(tool)

    // status=inbox → auto: runs without token.
    const r1 = await server.invoke('fake_kb_create', { title: 'a', status: 'inbox' }, baseCtx)
    expect(r1.result).toEqual({ created: 'a', status: 'inbox' })
    expect(handler).toHaveBeenCalledTimes(1)

    // status=verified → confirm: blocked.
    const promise = server.invoke('fake_kb_create', { title: 'b', status: 'verified' }, baseCtx)
    await expect(promise).rejects.toBeInstanceOf(ConfirmationRequiredError)
    await promise.catch((err: ConfirmationRequiredError) => {
      expect(err.reason).toBe('class')
      expect(err.input).toEqual({ title: 'b', status: 'verified' })
    })
    expect(handler).toHaveBeenCalledTimes(1) // unchanged

    // status=verified with token → runs.
    const r3 = await server.invoke('fake_kb_create', { title: 'c', status: 'verified' }, { ...baseCtx, confirmationToken: 'tok' })
    expect(r3.result).toEqual({ created: 'c', status: 'verified' })
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('auto-promotes to confirm when affectedCount(input) >= 6 (bulk override / ADR-010)', async () => {
    interface BulkInput { count: number }
    const schema = z.object({ count: z.number().int().min(0) })
    const handler = vi.fn((input: BulkInput) => ({ touched: input.count }))
    const tool: Tool<BulkInput, { touched: number }> = {
      name: 'bulk_op',
      description: 'A would-be auto tool with a bulk hook.',
      schema,
      class: 'auto',
      mode: 'write',
      handler,
      affectedCount: input => input.count,
    }
    const server = createMcpServer()
    server.register(tool)

    // count=5 → still auto.
    const r1 = await server.invoke<{ touched: number }>('bulk_op', { count: 5 }, baseCtx)
    expect(r1.result).toEqual({ touched: 5 })

    // count=6 → bulk-promoted to confirm.
    const promise = server.invoke('bulk_op', { count: 6 }, baseCtx)
    await expect(promise).rejects.toBeInstanceOf(ConfirmationRequiredError)
    await promise.catch((err: ConfirmationRequiredError) => {
      expect(err.toolName).toBe('bulk_op')
      expect(err.reason).toBe('bulk')
      expect(err.affectedCount).toBe(6)
      expect(err.input).toEqual({ count: 6 })
    })
    // Handler was only called once (the count=5 path).
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('bulk-promoted call runs when ctx.confirmationToken is present', async () => {
    interface BulkInput { count: number }
    const schema = z.object({ count: z.number().int().min(0) })
    const handler = vi.fn((input: BulkInput) => ({ touched: input.count }))
    const tool: Tool<BulkInput, { touched: number }> = {
      name: 'bulk_op',
      description: 'bulk',
      schema,
      class: 'auto',
      mode: 'write',
      handler,
      affectedCount: input => input.count,
    }
    const server = createMcpServer()
    server.register(tool)

    const r = await server.invoke<{ touched: number }>(
      'bulk_op',
      { count: 9 },
      { ...baseCtx, confirmationToken: 'tok' },
    )
    expect(r.result).toEqual({ touched: 9 })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('server.classify returns the same {effectiveClass, reason, affectedCount} triple without throwing', () => {
    const server = createMcpServer()
    // 1) plain auto tool.
    server.register(makeWriteTool({ name: 'plain_auto', class: 'auto' }))
    expect(server.classify('plain_auto', { value: 'x' })).toEqual({
      effectiveClass: 'auto',
      reason: 'class',
      affectedCount: 1,
    })

    // 2) static confirm tool.
    server.register(makeWriteTool({ name: 'plain_confirm', class: 'confirm' }))
    expect(server.classify('plain_confirm', { value: 'x' })).toEqual({
      effectiveClass: 'confirm',
      reason: 'class',
      affectedCount: 1,
    })

    // 3) bulk-promoted (auto → confirm via affectedCount).
    interface BulkInput { count: number }
    const schema = z.object({ count: z.number().int().min(0) })
    server.register({
      name: 'bulk_auto',
      description: 'bulk',
      schema,
      class: 'auto',
      mode: 'write',
      handler: () => ({ ok: true }),
      affectedCount: input => input.count,
    } as Tool<BulkInput>)
    expect(server.classify('bulk_auto', { count: 6 })).toEqual({
      effectiveClass: 'confirm',
      reason: 'bulk',
      affectedCount: 6,
    })
    expect(server.classify('bulk_auto', { count: 5 })).toEqual({
      effectiveClass: 'auto',
      reason: 'class',
      affectedCount: 5,
    })
  })
})
