import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../server/database/schema'
import { getDatabase } from '../server/infrastructure/database/client'
import { createItemService } from '../server/infrastructure/database/item-service'
import { buildEventKey, createEventBus } from '../server/infrastructure/events'
import { createOrganisationData } from './factories'

describe('event Bus', () => {
  describe('buildEventKey', () => {
    it('should build correct event key format', () => {
      expect(buildEventKey('users', 'created')).toBe('users:created')
      expect(buildEventKey('organisations', 'updated')).toBe('organisations:updated')
      expect(buildEventKey('teams', 'deleted')).toBe('teams:deleted')
    })
  })

  describe('createEventBus', () => {
    it('should create a functional event bus', () => {
      const eventBus = createEventBus()
      const handler = vi.fn()

      eventBus.on('test:created', handler)
      eventBus.emit('test:created', {
        tableName: 'test',
        operation: 'created',
        timestamp: new Date(),
        data: { id: '1' },
      })

      expect(handler).toHaveBeenCalledOnce()
    })

    it('should support wildcard listeners', () => {
      const eventBus = createEventBus()
      const handler = vi.fn()

      eventBus.on('*', handler)
      eventBus.emit('users:created', {
        tableName: 'users',
        operation: 'created',
        timestamp: new Date(),
        data: { id: '1' },
      })

      expect(handler).toHaveBeenCalledWith('users:created', expect.any(Object))
    })
  })
})

describe('itemService Event Emission', () => {
  let eventBus: ReturnType<typeof createEventBus>
  let organisationsService: ReturnType<typeof createItemService<typeof schema.organisations>>

  beforeEach(() => {
    eventBus = createEventBus()
    organisationsService = createItemService({
      db: getDatabase('app'),
      table: schema.organisations,
      tableName: 'organisations',
      eventBus,
    })
  })

  it('should emit created event on create()', async () => {
    const handler = vi.fn()
    eventBus.on('organisations:created', handler)

    const data = createOrganisationData()
    const result = await organisationsService.create(data)

    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        tableName: 'organisations',
        operation: 'created',
        timestamp: expect.any(Date),
        data: expect.objectContaining({ id: result.id }),
      }),
    )
  })

  it('should emit created event with metadata on createMany()', async () => {
    const handler = vi.fn()
    eventBus.on('organisations:created', handler)

    const dataArray = [createOrganisationData(), createOrganisationData()]
    const results = await organisationsService.createMany(dataArray)

    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        tableName: 'organisations',
        operation: 'created',
        data: expect.arrayContaining([
          expect.objectContaining({ id: results[0].id }),
          expect.objectContaining({ id: results[1].id }),
        ]),
        metadata: {
          count: 2,
          ids: expect.arrayContaining([results[0].id, results[1].id]),
        },
      }),
    )
  })

  it('should emit updated event on update()', async () => {
    const handler = vi.fn()
    const org = await organisationsService.create(createOrganisationData())

    eventBus.on('organisations:updated', handler)
    await organisationsService.update(org.id, { name: 'Updated Name' })

    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        tableName: 'organisations',
        operation: 'updated',
        data: expect.objectContaining({ name: 'Updated Name' }),
      }),
    )
  })

  it('should emit deleted event on delete()', async () => {
    const handler = vi.fn()
    const org = await organisationsService.create(createOrganisationData())

    eventBus.on('organisations:deleted', handler)
    await organisationsService.delete(org.id)

    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        tableName: 'organisations',
        operation: 'deleted',
        data: expect.objectContaining({ id: org.id }),
      }),
    )
  })

  it('should not emit events when eventBus is not provided', async () => {
    const serviceWithoutEventBus = createItemService({
      db: getDatabase('app'),
      table: schema.organisations,
      tableName: 'organisations',
    })

    // Should not throw
    await serviceWithoutEventBus.create(createOrganisationData())
  })
})
