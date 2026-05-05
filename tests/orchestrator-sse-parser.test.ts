/**
 * Unit tests for the orchestrator SSE parser (T-3.15).
 *
 * The parser is the lone piece of non-trivial logic in the streaming
 * client. We cover:
 *   - All six event types parse cleanly into the typed `ChatEvent` shape.
 *   - Partial chunks (split mid-event, mid-line, mid-`\n\n`) buffer until a
 *     full block arrives.
 *   - Malformed JSON / unknown event types are silently dropped (the server
 *     is the source of truth — clients shouldn't crash on additions).
 *   - SSE comments and `:`-prefixed heartbeats are ignored.
 */
import type { ChatEvent } from '../app/features/orchestrator/types/stream.types'
import { describe, expect, it } from 'vitest'

import { createSseParser } from '../app/features/orchestrator/types/stream.types'

const sseBlock = (event: string, payload: unknown): string =>
  `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`

describe('createSseParser', () => {
  it('parses a single text-delta event', () => {
    const parser = createSseParser()
    const events = parser.feed(sseBlock('text-delta', { messageId: 'm1', delta: 'hello' }))
    expect(events).toEqual<ChatEvent[]>([
      { type: 'text-delta', messageId: 'm1', delta: 'hello' },
    ])
  })

  it('parses all six event vocab types in order', () => {
    const parser = createSseParser()
    const stream = [
      sseBlock('text-delta', { messageId: 'm1', delta: 'Hi' }),
      sseBlock('tool-call', { toolCallId: 'tc1', toolName: 'kb_search', input: { q: 'foo' } }),
      sseBlock('tool-result', { toolCallId: 'tc1', actionId: 'a1', result: { rows: [] } }),
      sseBlock('confirmation_required', {
        toolCallId: 'tc2',
        actionId: 'a2',
        toolName: 'kb_update_entry',
        input: { id: 'e1' },
        affectedCount: 1,
        reason: 'class',
      }),
      sseBlock('message-complete', { messageId: 'm1' }),
      sseBlock('error', { code: 'failed', message: 'oops' }),
    ].join('')
    const events = parser.feed(stream)
    expect(events.map(e => e.type)).toEqual([
      'text-delta',
      'tool-call',
      'tool-result',
      'confirmation_required',
      'message-complete',
      'error',
    ])
    expect((events[3] as { reason: string }).reason).toBe('class')
    expect((events[3] as { affectedCount: number }).affectedCount).toBe(1)
  })

  it('buffers a chunk split mid-block', () => {
    const parser = createSseParser()
    const full = sseBlock('text-delta', { messageId: 'm1', delta: 'partial' })
    const half = Math.floor(full.length / 2)
    const a = full.slice(0, half)
    const b = full.slice(half)

    const first = parser.feed(a)
    expect(first).toEqual([])
    const second = parser.feed(b)
    expect(second).toEqual([
      { type: 'text-delta', messageId: 'm1', delta: 'partial' },
    ])
  })

  it('buffers chunks split mid-double-newline', () => {
    const parser = createSseParser()
    // Cut between the two newlines so the first feed has only one `\n`.
    const block = sseBlock('text-delta', { messageId: 'm1', delta: 'edge' })
    const cut = block.lastIndexOf('\n\n') + 1 // include first newline only
    const a = block.slice(0, cut)
    const b = block.slice(cut)
    expect(parser.feed(a)).toEqual([])
    expect(parser.feed(b)).toEqual([
      { type: 'text-delta', messageId: 'm1', delta: 'edge' },
    ])
  })

  it('emits multiple events when a chunk contains several blocks', () => {
    const parser = createSseParser()
    const stream
      = sseBlock('text-delta', { messageId: 'm1', delta: 'A' })
        + sseBlock('text-delta', { messageId: 'm1', delta: 'B' })
        + sseBlock('message-complete', { messageId: 'm1' })
    const events = parser.feed(stream)
    expect(events).toHaveLength(3)
    expect((events[0] as { delta: string }).delta).toBe('A')
    expect((events[1] as { delta: string }).delta).toBe('B')
    expect(events[2]?.type).toBe('message-complete')
  })

  it('drops blocks with malformed JSON', () => {
    const parser = createSseParser()
    const bad = `event: text-delta\ndata: {not-json\n\n`
    const good = sseBlock('text-delta', { messageId: 'm1', delta: 'after' })
    const events = parser.feed(bad + good)
    expect(events).toEqual([
      { type: 'text-delta', messageId: 'm1', delta: 'after' },
    ])
  })

  it('drops blocks with unknown event types', () => {
    const parser = createSseParser()
    const unknown = `event: future-feature\ndata: ${JSON.stringify({ foo: 1 })}\n\n`
    const known = sseBlock('text-delta', { messageId: 'm1', delta: 'ok' })
    const events = parser.feed(unknown + known)
    expect(events).toEqual([
      { type: 'text-delta', messageId: 'm1', delta: 'ok' },
    ])
  })

  it('ignores SSE comment / heartbeat lines', () => {
    const parser = createSseParser()
    const stream = `: keep-alive\n\nevent: text-delta\ndata: ${JSON.stringify({ messageId: 'm1', delta: 'ping' })}\n\n`
    const events = parser.feed(stream)
    expect(events).toEqual([
      { type: 'text-delta', messageId: 'm1', delta: 'ping' },
    ])
  })

  it('handles CRLF line endings the same as LF', () => {
    const parser = createSseParser()
    const block = `event: text-delta\r\ndata: ${JSON.stringify({ messageId: 'm1', delta: 'crlf' })}\r\n\r\n`
    const events = parser.feed(block)
    expect(events).toEqual([
      { type: 'text-delta', messageId: 'm1', delta: 'crlf' },
    ])
  })

  it('flush() yields a tail event with no trailing blank line', () => {
    const parser = createSseParser()
    const block = `event: text-delta\ndata: ${JSON.stringify({ messageId: 'm1', delta: 'tail' })}` // no \n\n
    expect(parser.feed(block)).toEqual([])
    expect(parser.flush()).toEqual([
      { type: 'text-delta', messageId: 'm1', delta: 'tail' },
    ])
  })
})
