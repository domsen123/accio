/**
 * Single-stream SSE consumer for the orchestrator chat endpoints (T-3.15).
 *
 * Wraps a single in-flight POST request that returns `text/event-stream` from
 * one of the three chat routes:
 *   - `POST /api/orchestrator/conversations/[id]/messages`
 *   - `POST /api/orchestrator/conversations/[id]/confirm`
 *   - `POST /api/orchestrator/conversations/[id]/cancel`
 *
 * Surface:
 *   - `start(urlPath, body)`         opens the stream
 *   - `abort()`                      cancels the in-flight request
 *   - `retry()`                      re-runs the most recent `start()` args
 *   - `reset()`                      clears event buffer + partial state
 *   - `onEvent(handler)`             subscribe to live events; returns unsub
 *   - `events`                       append-only ChatEvent[] for the turn
 *   - `isStreaming`                  Ref<boolean>
 *
 * Reconnect strategy: if the connection drops mid-stream, we emit a synthetic
 * `error { code: 'connection_lost' }` event and STOP. We do NOT auto-reconnect
 * — re-opening the messages endpoint would re-send the user message, and
 * confirm/cancel could double-execute. The caller drives reconnection via
 * `retry()` once it has confirmed the user wants to resend.
 */
import type { Ref } from 'vue'
import type { ChatEvent } from '../types/stream.types'
import { ref, shallowRef } from 'vue'
import { createSseParser } from '../types/stream.types'

interface StartArgs {
  urlPath: string
  body: Record<string, unknown>
}

export interface UseChatStream {
  start: (urlPath: string, body: Record<string, unknown>) => Promise<void>
  abort: () => void
  retry: () => Promise<void>
  reset: () => void
  onEvent: (handler: (e: ChatEvent) => void) => () => void
  events: Ref<ChatEvent[]>
  isStreaming: Ref<boolean>
}

export const useChatStream = (): UseChatStream => {
  const events = shallowRef<ChatEvent[]>([])
  const isStreaming = ref(false)
  const handlers = new Set<(e: ChatEvent) => void>()
  let controller: AbortController | null = null
  let lastArgs: StartArgs | null = null

  const emit = (event: ChatEvent) => {
    events.value = [...events.value, event]
    for (const h of handlers) {
      try {
        h(event)
      }
      catch {
        // swallow listener errors so one bad listener can't kill the stream
      }
    }
  }

  const reset = () => {
    events.value = []
  }

  const onEvent = (handler: (e: ChatEvent) => void) => {
    handlers.add(handler)
    return () => {
      handlers.delete(handler)
    }
  }

  const abort = () => {
    if (controller) {
      controller.abort()
      controller = null
    }
    isStreaming.value = false
  }

  const consumeStream = async (resp: Response) => {
    const body = resp.body
    if (!body) {
      emit({
        type: 'error',
        code: 'no_response_body',
        message: 'Server returned no stream body.',
      })
      return
    }

    const parser = createSseParser()
    const reader = body.getReader()
    const decoder = new TextDecoder('utf-8')

    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done)
          break
        const chunk = decoder.decode(value, { stream: true })
        if (chunk.length === 0)
          continue
        for (const ev of parser.feed(chunk))
          emit(ev)
      }
      // Drain decoder + flush any tail event the server didn't terminate.
      const tail = decoder.decode()
      if (tail.length > 0) {
        for (const ev of parser.feed(tail))
          emit(ev)
      }
      for (const ev of parser.flush())
        emit(ev)
    }
    catch (err) {
      // Aborted by the caller — silent.
      if ((err as { name?: string } | null)?.name === 'AbortError')
        return
      emit({
        type: 'error',
        code: 'connection_lost',
        message: err instanceof Error ? err.message : 'Stream connection lost',
      })
    }
    finally {
      try {
        reader.releaseLock()
      }
      catch {
        // already released
      }
    }
  }

  const run = async ({ urlPath, body }: StartArgs) => {
    if (isStreaming.value)
      abort()
    controller = new AbortController()
    isStreaming.value = true
    try {
      // Use native fetch over $fetch.raw because we need ReadableStream access
      // and a uniform handling for SSR cookies; the chat endpoints are
      // client-only (the page mounts before send is callable). `credentials`
      // ensures the session cookie is sent.
      const resp = await fetch(urlPath, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: {
          'content-type': 'application/json',
          'accept': 'text/event-stream',
        },
        credentials: 'include',
        signal: controller.signal,
      })
      if (!resp.ok) {
        // 4xx/5xx: try to surface a useful error code/message without retrying.
        let payloadCode = `http_${resp.status}`
        let payloadMessage = resp.statusText || `HTTP ${resp.status}`
        try {
          const text = await resp.text()
          if (text) {
            try {
              const parsed = JSON.parse(text) as { statusMessage?: string, message?: string, data?: { message?: string } }
              payloadMessage = parsed.statusMessage ?? parsed.message ?? parsed.data?.message ?? payloadMessage
              if (parsed.statusMessage)
                payloadCode = parsed.statusMessage
            }
            catch {
              payloadMessage = text.slice(0, 500)
            }
          }
        }
        catch { /* ignore body read failure */ }
        emit({ type: 'error', code: payloadCode, message: payloadMessage })
        return
      }
      await consumeStream(resp)
    }
    finally {
      isStreaming.value = false
      controller = null
    }
  }

  const start = async (urlPath: string, body: Record<string, unknown>) => {
    lastArgs = { urlPath, body }
    await run(lastArgs)
  }

  const retry = async () => {
    if (!lastArgs)
      return
    await run(lastArgs)
  }

  return {
    start,
    abort,
    retry,
    reset,
    onEvent,
    events,
    isStreaming,
  }
}
