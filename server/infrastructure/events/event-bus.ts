import type { Emitter } from 'mitt'
import mitt from 'mitt'

export interface CrudEventPayload<T = unknown> {
  tableName: string
  operation: 'created' | 'updated' | 'deleted'
  timestamp: Date
  data: T | T[]
  metadata?: {
    count?: number
    ids?: string[]
  }
}

export type CrudEventKey = `${string}:${'created' | 'updated' | 'deleted'}`

// Domain Events
// move this to ./server/types/*.ts if its get more and more types
export interface UserRegisteredPayload {
  userId: string
  email: string | null
  timestamp: Date
}

// All event types using Record for mitt compatibility
export type EventBusEvents = Record<CrudEventKey, CrudEventPayload> & {
  'auth:user-registered': UserRegisteredPayload
}

export type EventBus = Emitter<EventBusEvents>

export const createEventBus = (): EventBus => mitt<EventBusEvents>()

export const buildEventKey = (
  tableName: string,
  operation: 'created' | 'updated' | 'deleted',
): CrudEventKey => `${tableName}:${operation}`
