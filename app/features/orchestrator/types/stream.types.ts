/**
 * Client-side SSE event vocabulary for the orchestrator chat stream (T-3.15).
 *
 * Mirrors the server vocabulary documented at the head of
 * `server/api/orchestrator/conversations/[id]/messages.post.ts`. Each variant
 * matches the JSON-encoded `data` field of an `event:<type>` SSE block.
 *
 * Note: `confirmation_required` uses an underscore (matching the server) while
 * the rest are dash-separated, intentionally — they reflect the on-the-wire
 * `event:` line verbatim so the parser can switch on `type` directly.
 */

export type ChatEvent
  = | TextDeltaEvent
    | ToolCallEvent
    | ToolResultEvent
    | ConfirmationRequiredEvent
    | MessageCompleteEvent
    | ErrorEvent

export interface TextDeltaEvent {
  type: 'text-delta'
  messageId: string
  delta: string
}

export interface ToolCallEvent {
  type: 'tool-call'
  toolCallId: string
  toolName: string
  input: unknown
}

export interface ToolResultEvent {
  type: 'tool-result'
  toolCallId: string
  actionId: string
  result: unknown
}

export interface ConfirmationRequiredEvent {
  type: 'confirmation_required'
  toolCallId: string
  actionId: string
  toolName: string
  input: unknown
  affectedCount: number
  reason: 'class' | 'bulk'
}

export interface MessageCompleteEvent {
  type: 'message-complete'
  messageId: string
}

export interface ErrorEvent {
  type: 'error'
  code: string
  message: string
}

/**
 * Stateless SSE parser. Feed it chunks of decoded text via `feed()`; it
 * returns the events emitted by that chunk (zero or more). Events are framed
 * by a blank line (`\n\n`); each event's `event:` line names the type and the
 * `data:` line(s) carry the JSON payload.
 *
 * The parser handles partial chunks — bytes mid-event are buffered until the
 * blank line arrives.
 */
export interface SseParserHandle {
  feed: (chunk: string) => ChatEvent[]
  /** Flush any tail event that lacks a trailing blank line (rare). */
  flush: () => ChatEvent[]
}

const isChatEventType = (t: string): t is ChatEvent['type'] =>
  t === 'text-delta'
  || t === 'tool-call'
  || t === 'tool-result'
  || t === 'confirmation_required'
  || t === 'message-complete'
  || t === 'error'

const parseBlock = (block: string): ChatEvent | null => {
  let event: string | null = null
  const dataLines: string[] = []
  for (const rawLine of block.split('\n')) {
    const line = rawLine.replace(/\r$/, '')
    if (line.length === 0)
      continue
    if (line.startsWith(':'))
      continue // SSE comment / heartbeat
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim()
    }
    else if (line.startsWith('data:')) {
      // Per SSE spec, leading single space after `data:` is part of the
      // delimiter; everything after is payload. Multiple `data:` lines join
      // with `\n`.
      const value = line.slice('data:'.length)
      dataLines.push(value.startsWith(' ') ? value.slice(1) : value)
    }
  }
  if (!event || !isChatEventType(event))
    return null
  if (dataLines.length === 0)
    return null
  let payload: unknown
  try {
    payload = JSON.parse(dataLines.join('\n'))
  }
  catch {
    return null
  }
  if (!payload || typeof payload !== 'object')
    return null
  // Trust the server's shape (the `event:` name is the discriminant); cast
  // through unknown so the union resolves cleanly without per-variant
  // duplicated guards.
  return { type: event, ...(payload as object) } as ChatEvent
}

export const createSseParser = (): SseParserHandle => {
  let buffer = ''

  const drainBlocks = (): ChatEvent[] => {
    const events: ChatEvent[] = []
    // Normalise CRLFCRLF / CRCR boundaries to LFLF for split.
    let working = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    let idx = working.indexOf('\n\n')
    while (idx !== -1) {
      const block = working.slice(0, idx)
      working = working.slice(idx + 2)
      const ev = parseBlock(block)
      if (ev)
        events.push(ev)
      idx = working.indexOf('\n\n')
    }
    buffer = working
    return events
  }

  return {
    feed: (chunk: string) => {
      buffer += chunk
      return drainBlocks()
    },
    flush: () => {
      const tail = buffer.trim()
      if (tail.length === 0) {
        buffer = ''
        return []
      }
      const ev = parseBlock(tail)
      buffer = ''
      return ev ? [ev] : []
    },
  }
}
