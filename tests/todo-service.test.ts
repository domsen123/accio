import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '../server/database/schema'
import { createKbEntryService, createKbTagService } from '../server/features/kb/service'
import { createTodoService } from '../server/features/todo/service'
import {
  TodoCannotPurgeActiveError,
  TodoKbLinkNotFoundError,
  TodoNotFoundError,
  TodoParentNotFoundError,
  TodoSubtaskDepthExceededError,
} from '../server/features/todo/types'
import { getDatabase } from '../server/infrastructure/database/client'
import { createItemService } from '../server/infrastructure/database/item-service'

import { createOrganisationData } from './factories'

const db = getDatabase('app')

const organisationsItemService = createItemService({ db, table: schema.organisations, tableName: 'organisations' })
const todosItemService = createItemService({ db, table: schema.todos, tableName: 'todos' })
const kbEntriesItemService = createItemService({ db, table: schema.kbEntries, tableName: 'kbEntries' })
const kbTagsItemService = createItemService({ db, table: schema.kbTags, tableName: 'kbTags' })

const kbTagService = createKbTagService({ db, kbTagsItemService })
const kbEntryService = createKbEntryService({
  db,
  kbEntriesItemService,
  kbTagService,
})
const todoService = createTodoService({
  db,
  todosItemService,
  kbTagService,
})

const setupOrg = async () => {
  return organisationsItemService.create(createOrganisationData())
}

describe('todoService — CRUD basics', () => {
  let orgId: string

  beforeEach(async () => {
    orgId = (await setupOrg()).id
  })

  it('creates a todo with title-only and the documented defaults', async () => {
    const todo = await todoService.create({ organisationId: orgId, title: 'Buy milk' })

    expect(todo.id).toBeDefined()
    expect(todo.title).toBe('Buy milk')
    expect(todo.priority).toBe('medium')
    expect(todo.dueAt).toBeNull()
    expect(todo.completedAt).toBeNull()
    expect(todo.deletedAt).toBeNull()
    expect(todo.parentTodoId).toBeNull()
  })

  it('honours explicit priority and due date overrides', async () => {
    const due = new Date(Date.now() + 86_400_000)
    const todo = await todoService.create({
      organisationId: orgId,
      title: 'Pay bill',
      priority: 'urgent',
      dueAt: due,
      description: 'Quarterly tax',
    })

    expect(todo.priority).toBe('urgent')
    expect(todo.dueAt?.getTime()).toBe(due.getTime())
    expect(todo.descriptionMd).toBe('Quarterly tax')
  })

  it('rejects a missing or whitespace-only title', async () => {
    await expect(
      todoService.create({ organisationId: orgId, title: '   ' }),
    ).rejects.toThrow()
  })

  it('findById hydrates tags, kb links, and subtask count', async () => {
    const entry = await kbEntryService.create({ organisationId: orgId, title: 'Bills' })
    const todo = await todoService.create({
      organisationId: orgId,
      title: 'Pay rent',
      tagNames: ['bills', 'urgent'],
      kbEntryIds: [entry.id],
    })
    await todoService.create({
      organisationId: orgId,
      title: 'subtask',
      parentTodoId: todo.id,
    })

    const hydrated = await todoService.findById({ organisationId: orgId, id: todo.id })
    expect(hydrated).not.toBeNull()
    expect(hydrated!.tags.map(t => t.name).sort()).toEqual(['bills', 'urgent'])
    expect(hydrated!.kbEntries.map(e => e.id)).toEqual([entry.id])
    expect(hydrated!.subtaskCount).toBe(1)
  })

  it('update edits title/description/priority and findById reflects them', async () => {
    const todo = await todoService.create({ organisationId: orgId, title: 'Original' })

    const updated = await todoService.update(todo.id, {
      title: 'Renamed',
      description: 'Notes',
      priority: 'high',
    })
    expect(updated.title).toBe('Renamed')
    expect(updated.descriptionMd).toBe('Notes')
    expect(updated.priority).toBe('high')

    const fresh = await todoService.findById({ organisationId: orgId, id: todo.id })
    expect(fresh?.title).toBe('Renamed')
    expect(fresh?.priority).toBe('high')
  })

  it('update with dueAt: null clears the due date', async () => {
    const todo = await todoService.create({
      organisationId: orgId,
      title: 'With due',
      dueAt: new Date(),
    })
    expect(todo.dueAt).not.toBeNull()

    const cleared = await todoService.update(todo.id, { dueAt: null })
    expect(cleared.dueAt).toBeNull()
  })

  it('update on missing todo throws TodoNotFoundError', async () => {
    await expect(
      todoService.update('nonexistent', { title: 'x' }),
    ).rejects.toBeInstanceOf(TodoNotFoundError)
  })

  it('softDelete excludes from default list; restore brings it back', async () => {
    const todo = await todoService.create({ organisationId: orgId, title: 'Trashable' })

    await todoService.softDelete(todo.id)
    const afterDelete = await todoService.list({ organisationId: orgId })
    expect(afterDelete.map(t => t.id)).not.toContain(todo.id)

    // includeDeleted: true exposes it
    const withTrash = await todoService.list({ organisationId: orgId, includeDeleted: true })
    expect(withTrash.map(t => t.id)).toContain(todo.id)

    const restored = await todoService.restore(todo.id)
    expect(restored.deletedAt).toBeNull()

    const afterRestore = await todoService.list({ organisationId: orgId })
    expect(afterRestore.map(t => t.id)).toContain(todo.id)
  })
})

describe('todoService — subtask depth (REQ-TODO-2)', () => {
  let orgId: string

  beforeEach(async () => {
    orgId = (await setupOrg()).id
  })

  it('allows nesting up to depth 3 (root + 2 children)', async () => {
    const root = await todoService.create({ organisationId: orgId, title: 'D1' })
    const child = await todoService.create({
      organisationId: orgId,
      title: 'D2',
      parentTodoId: root.id,
    })
    const grandchild = await todoService.create({
      organisationId: orgId,
      title: 'D3',
      parentTodoId: child.id,
    })

    expect(grandchild.parentTodoId).toBe(child.id)
  })

  it('throws TodoSubtaskDepthExceededError when creating depth 4', async () => {
    const root = await todoService.create({ organisationId: orgId, title: 'D1' })
    const child = await todoService.create({
      organisationId: orgId,
      title: 'D2',
      parentTodoId: root.id,
    })
    const grandchild = await todoService.create({
      organisationId: orgId,
      title: 'D3',
      parentTodoId: child.id,
    })

    await expect(
      todoService.create({
        organisationId: orgId,
        title: 'D4',
        parentTodoId: grandchild.id,
      }),
    ).rejects.toBeInstanceOf(TodoSubtaskDepthExceededError)
  })

  it('update re-parenting re-validates depth and rejects depth-4', async () => {
    const root = await todoService.create({ organisationId: orgId, title: 'Root' })
    const mid = await todoService.create({
      organisationId: orgId,
      title: 'Mid',
      parentTodoId: root.id,
    })
    const leaf = await todoService.create({
      organisationId: orgId,
      title: 'Leaf',
      parentTodoId: mid.id,
    })
    const orphan = await todoService.create({ organisationId: orgId, title: 'Orphan' })

    // orphan under leaf would be depth 4 → reject
    await expect(
      todoService.update(orphan.id, { parentTodoId: leaf.id }),
    ).rejects.toBeInstanceOf(TodoSubtaskDepthExceededError)

    // orphan under mid is depth 3 → allowed
    const reparented = await todoService.update(orphan.id, { parentTodoId: mid.id })
    expect(reparented.parentTodoId).toBe(mid.id)
  })

  it('rejects a parent in another workspace as TodoParentNotFoundError', async () => {
    const otherOrg = (await setupOrg()).id
    const otherTodo = await todoService.create({
      organisationId: otherOrg,
      title: 'Foreign',
    })

    await expect(
      todoService.create({
        organisationId: orgId,
        title: 'Cross-ws child',
        parentTodoId: otherTodo.id,
      }),
    ).rejects.toBeInstanceOf(TodoParentNotFoundError)
  })

  it('self-parent on update is rejected (depth-exceeded path)', async () => {
    const todo = await todoService.create({ organisationId: orgId, title: 'Self' })
    await expect(
      todoService.update(todo.id, { parentTodoId: todo.id }),
    ).rejects.toBeInstanceOf(TodoSubtaskDepthExceededError)
  })
})

describe('todoService — tag set replace', () => {
  let orgId: string

  beforeEach(async () => {
    orgId = (await setupOrg()).id
  })

  it('create with tagNames materialises kb_tags rows + junction', async () => {
    const todo = await todoService.create({
      organisationId: orgId,
      title: 'Tagged',
      tagNames: ['Foo', 'bar'],
    })

    const hydrated = await todoService.findById({ organisationId: orgId, id: todo.id })
    expect(hydrated!.tags.map(t => t.name).sort()).toEqual(['Foo', 'bar'])

    // Tags reuse kb_tags — verify the rows show up there.
    const tagRows = await kbTagService.list({ organisationId: orgId })
    expect(tagRows).toHaveLength(2)
  })

  it('update with tagNames replaces the previous set (additions + removals)', async () => {
    const todo = await todoService.create({
      organisationId: orgId,
      title: 'T',
      tagNames: ['alpha', 'beta'],
    })

    await todoService.update(todo.id, { tagNames: ['gamma'] })

    const hydrated = await todoService.findById({ organisationId: orgId, id: todo.id })
    expect(hydrated!.tags.map(t => t.name)).toEqual(['gamma'])
  })

  it('cross-workspace tag isolation: same name in two orgs are different rows', async () => {
    const otherOrg = (await setupOrg()).id

    const a = await todoService.create({
      organisationId: orgId,
      title: 'A',
      tagNames: ['shared'],
    })
    const b = await todoService.create({
      organisationId: otherOrg,
      title: 'B',
      tagNames: ['shared'],
    })

    const ah = await todoService.findById({ organisationId: orgId, id: a.id })
    const bh = await todoService.findById({ organisationId: otherOrg, id: b.id })

    expect(ah!.tags[0].id).not.toBe(bh!.tags[0].id)
    expect(ah!.tags[0].organisationId).toBe(orgId)
    expect(bh!.tags[0].organisationId).toBe(otherOrg)
  })
})

describe('todoService — KB links', () => {
  let orgId: string

  beforeEach(async () => {
    orgId = (await setupOrg()).id
  })

  it('create with kbEntryIds populates the junction; findById exposes them', async () => {
    const e1 = await kbEntryService.create({ organisationId: orgId, title: 'Entry 1' })
    const e2 = await kbEntryService.create({ organisationId: orgId, title: 'Entry 2' })

    const todo = await todoService.create({
      organisationId: orgId,
      title: 'Linked',
      kbEntryIds: [e1.id, e2.id],
    })

    const hydrated = await todoService.findById({ organisationId: orgId, id: todo.id })
    expect(hydrated!.kbEntries.map(e => e.id).sort()).toEqual([e1.id, e2.id].sort())
  })

  it('update with kbEntryIds replaces the link set', async () => {
    const e1 = await kbEntryService.create({ organisationId: orgId, title: 'Old' })
    const e2 = await kbEntryService.create({ organisationId: orgId, title: 'New' })

    const todo = await todoService.create({
      organisationId: orgId,
      title: 'L',
      kbEntryIds: [e1.id],
    })

    await todoService.update(todo.id, { kbEntryIds: [e2.id] })
    const hydrated = await todoService.findById({ organisationId: orgId, id: todo.id })
    expect(hydrated!.kbEntries.map(e => e.id)).toEqual([e2.id])
  })

  it('rejects a kbEntryId from another workspace', async () => {
    const otherOrg = (await setupOrg()).id
    const foreign = await kbEntryService.create({
      organisationId: otherOrg,
      title: 'Foreign Entry',
    })

    await expect(
      todoService.create({
        organisationId: orgId,
        title: 'Will fail',
        kbEntryIds: [foreign.id],
      }),
    ).rejects.toBeInstanceOf(TodoKbLinkNotFoundError)
  })

  it('linkKb / unlinkKb are idempotent', async () => {
    const entry = await kbEntryService.create({ organisationId: orgId, title: 'Ent' })
    const todo = await todoService.create({ organisationId: orgId, title: 'Todo' })

    await todoService.linkKb({ todoId: todo.id, entryId: entry.id })
    await todoService.linkKb({ todoId: todo.id, entryId: entry.id }) // idempotent

    const links = await db
      .select()
      .from(schema.todoKbLinks)
      .where(eq(schema.todoKbLinks.todoId, todo.id))
    expect(links).toHaveLength(1)

    await todoService.unlinkKb({ todoId: todo.id, entryId: entry.id })
    await todoService.unlinkKb({ todoId: todo.id, entryId: entry.id }) // idempotent

    const after = await db
      .select()
      .from(schema.todoKbLinks)
      .where(eq(schema.todoKbLinks.todoId, todo.id))
    expect(after).toHaveLength(0)
  })
})

describe('todoService — completion + workspace isolation', () => {
  let orgId: string

  beforeEach(async () => {
    orgId = (await setupOrg()).id
  })

  it('complete then uncomplete round-trips and is idempotent', async () => {
    const todo = await todoService.create({ organisationId: orgId, title: 'Done?' })

    const completed = await todoService.complete(todo.id)
    expect(completed.completedAt).toBeInstanceOf(Date)

    const completedAgain = await todoService.complete(todo.id)
    expect(completedAgain.completedAt?.getTime()).toBe(completed.completedAt?.getTime())

    const uncompleted = await todoService.uncomplete(todo.id)
    expect(uncompleted.completedAt).toBeNull()

    const uncompletedAgain = await todoService.uncomplete(todo.id)
    expect(uncompletedAgain.completedAt).toBeNull()
  })

  it('a todo in workspace A is invisible in workspace B', async () => {
    const otherOrg = (await setupOrg()).id

    const mine = await todoService.create({ organisationId: orgId, title: 'Mine' })
    await todoService.create({ organisationId: otherOrg, title: 'Theirs' })

    const inA = await todoService.list({ organisationId: orgId })
    const inB = await todoService.list({ organisationId: otherOrg })
    expect(inA.map(t => t.id)).toEqual([mine.id])
    expect(inB.map(t => t.id)).not.toContain(mine.id)

    // findById is workspace-scoped: lookup from B finds nothing.
    expect(
      await todoService.findById({ organisationId: otherOrg, id: mine.id }),
    ).toBeNull()
  })
})

describe('todoService — list filters', () => {
  let orgId: string

  beforeEach(async () => {
    orgId = (await setupOrg()).id
  })

  it('completed: false excludes completed; completed: true returns only completed', async () => {
    const a = await todoService.create({ organisationId: orgId, title: 'Active' })
    const b = await todoService.create({ organisationId: orgId, title: 'Done' })
    await todoService.complete(b.id)

    const open = await todoService.list({ organisationId: orgId, completed: false })
    expect(open.map(t => t.id)).toEqual([a.id])

    const done = await todoService.list({ organisationId: orgId, completed: true })
    expect(done.map(t => t.id)).toEqual([b.id])
  })

  it('priority filter selects only matching rows', async () => {
    const high = await todoService.create({ organisationId: orgId, title: 'H', priority: 'high' })
    await todoService.create({ organisationId: orgId, title: 'M', priority: 'medium' })
    await todoService.create({ organisationId: orgId, title: 'L', priority: 'low' })

    const onlyHigh = await todoService.list({ organisationId: orgId, priority: 'high' })
    expect(onlyHigh.map(t => t.id)).toEqual([high.id])
  })

  it('dueBefore filters todos whose dueAt is before the boundary', async () => {
    const today = new Date()
    const tomorrow = new Date(today.getTime() + 86_400_000)
    const inAWeek = new Date(today.getTime() + 7 * 86_400_000)

    const t1 = await todoService.create({ organisationId: orgId, title: 'T1', dueAt: today })
    const t2 = await todoService.create({ organisationId: orgId, title: 'T2', dueAt: tomorrow })
    await todoService.create({ organisationId: orgId, title: 'T3', dueAt: inAWeek })

    const due = await todoService.list({
      organisationId: orgId,
      dueBefore: new Date(today.getTime() + 2 * 86_400_000),
    })
    expect(due.map(t => t.id).sort()).toEqual([t1.id, t2.id].sort())
  })

  it('parentTodoId === null returns only top-level todos', async () => {
    const root = await todoService.create({ organisationId: orgId, title: 'Root' })
    await todoService.create({
      organisationId: orgId,
      title: 'Child',
      parentTodoId: root.id,
    })
    const otherRoot = await todoService.create({ organisationId: orgId, title: 'Other Root' })

    const tops = await todoService.list({ organisationId: orgId, parentTodoId: null })
    expect(tops.map(t => t.id).sort()).toEqual([root.id, otherRoot.id].sort())
  })

  it('parentTodoId: <id> returns direct children of that parent', async () => {
    const root = await todoService.create({ organisationId: orgId, title: 'Root' })
    const c1 = await todoService.create({
      organisationId: orgId,
      title: 'C1',
      parentTodoId: root.id,
    })
    const c2 = await todoService.create({
      organisationId: orgId,
      title: 'C2',
      parentTodoId: root.id,
    })
    // Grandchild — not returned by a direct-children filter.
    await todoService.create({
      organisationId: orgId,
      title: 'GC',
      parentTodoId: c1.id,
    })

    const children = await todoService.list({
      organisationId: orgId,
      parentTodoId: root.id,
    })
    expect(children.map(t => t.id).sort()).toEqual([c1.id, c2.id].sort())
  })

  it('search ILIKEs title and description', async () => {
    const a = await todoService.create({
      organisationId: orgId,
      title: 'Buy groceries',
    })
    const b = await todoService.create({
      organisationId: orgId,
      title: 'Random',
      description: 'mention groceries inside',
    })
    await todoService.create({ organisationId: orgId, title: 'Unrelated' })

    const hits = await todoService.list({ organisationId: orgId, search: 'groce' })
    expect(hits.map(t => t.id).sort()).toEqual([a.id, b.id].sort())
  })

  it('list filters by tagId via the junction table', async () => {
    const todo = await todoService.create({
      organisationId: orgId,
      title: 'Tagged',
      tagNames: ['target'],
    })
    await todoService.create({ organisationId: orgId, title: 'Untagged' })

    const tag = (await kbTagService.list({ organisationId: orgId }))[0]
    const hits = await todoService.list({ organisationId: orgId, tagId: tag.id })
    expect(hits.map(t => t.id)).toEqual([todo.id])
  })

  it('list filters by kbEntryId via the junction table', async () => {
    const entry = await kbEntryService.create({ organisationId: orgId, title: 'Linked' })
    const linkedTodo = await todoService.create({
      organisationId: orgId,
      title: 'Linked',
      kbEntryIds: [entry.id],
    })
    await todoService.create({ organisationId: orgId, title: 'Lonely' })

    const hits = await todoService.list({ organisationId: orgId, kbEntryId: entry.id })
    expect(hits.map(t => t.id)).toEqual([linkedTodo.id])
  })
})

describe('todoService — canonical views (REQ-TODO-4)', () => {
  let orgId: string

  /**
   * Build a date `daysFromNow` days from current UTC midnight at 12:00 UTC —
   * far enough from day boundaries that local-vs-UTC differences in the test
   * runner can't kick a fixture into the next/previous day. Database date
   * comparisons use `due_at::date` which truncates to UTC date.
   */
  const dueAtDays = (daysFromNow: number) => {
    const d = new Date()
    d.setUTCHours(12, 0, 0, 0)
    d.setUTCDate(d.getUTCDate() + daysFromNow)
    return d
  }

  // Identifiers populated by `seedFixture` so view assertions can refer to
  // them by role. We map an alias → todo id so the test reads naturally.
  type FixtureKey
    = | 'overdue'
      | 'today'
      | 'tomorrow'
      | 'plus5'
      | 'plus10'
      | 'noDue'
      | 'completed'

  const seedFixture = async (organisationId: string) => {
    const ids = {} as Record<FixtureKey, string>

    ids.overdue = (await todoService.create({
      organisationId,
      title: 'Overdue task',
      dueAt: dueAtDays(-3),
      priority: 'high',
    })).id

    ids.today = (await todoService.create({
      organisationId,
      title: 'Due today',
      dueAt: dueAtDays(0),
      priority: 'urgent',
    })).id

    ids.tomorrow = (await todoService.create({
      organisationId,
      title: 'Due tomorrow',
      dueAt: dueAtDays(1),
      priority: 'medium',
    })).id

    ids.plus5 = (await todoService.create({
      organisationId,
      title: 'Due in 5 days',
      dueAt: dueAtDays(5),
      priority: 'low',
    })).id

    ids.plus10 = (await todoService.create({
      organisationId,
      title: 'Due in 10 days',
      dueAt: dueAtDays(10),
      priority: 'medium',
    })).id

    ids.noDue = (await todoService.create({
      organisationId,
      title: 'No due date',
      priority: 'high',
    })).id

    const completed = await todoService.create({
      organisationId,
      title: 'Already done',
      dueAt: dueAtDays(-1),
      priority: 'low',
    })
    await todoService.complete(completed.id)
    ids.completed = completed.id

    return ids
  }

  beforeEach(async () => {
    orgId = (await setupOrg()).id
  })

  it('listToday includes overdue + due-today, excludes everything else', async () => {
    const ids = await seedFixture(orgId)
    const view = await todoService.listToday({ organisationId: orgId })
    const viewIds = view.map(t => t.id)

    expect(viewIds).toContain(ids.overdue)
    expect(viewIds).toContain(ids.today)
    expect(viewIds).not.toContain(ids.tomorrow)
    expect(viewIds).not.toContain(ids.plus5)
    expect(viewIds).not.toContain(ids.plus10)
    expect(viewIds).not.toContain(ids.noDue)
    expect(viewIds).not.toContain(ids.completed)
    expect(view).toHaveLength(2)
  })

  it('listToday sorts by due_at ASC then priority urgent → low', async () => {
    const ids = await seedFixture(orgId)
    // Add a second overdue at the same date as the existing overdue but with
    // a lower priority so the priority tiebreak is observable.
    const overdueLow = (await todoService.create({
      organisationId: orgId,
      title: 'Overdue low',
      dueAt: dueAtDays(-3),
      priority: 'low',
    })).id

    const view = await todoService.listToday({ organisationId: orgId })
    const viewIds = view.map(t => t.id)

    // Overdue (3 days ago) sorts before today.
    expect(viewIds[viewIds.length - 1]).toBe(ids.today)
    // Among the two overdue rows, 'high' beats 'low'.
    const overdueHighIdx = viewIds.indexOf(ids.overdue)
    const overdueLowIdx = viewIds.indexOf(overdueLow)
    expect(overdueHighIdx).toBeLessThan(overdueLowIdx)
  })

  it('listUpcoming default 7d includes tomorrow + +5; excludes today/overdue/+10/no-due/completed', async () => {
    const ids = await seedFixture(orgId)
    const view = await todoService.listUpcoming({ organisationId: orgId })
    const viewIds = view.map(t => t.id)

    expect(viewIds).toContain(ids.tomorrow)
    expect(viewIds).toContain(ids.plus5)
    expect(viewIds).not.toContain(ids.today)
    expect(viewIds).not.toContain(ids.overdue)
    expect(viewIds).not.toContain(ids.plus10)
    expect(viewIds).not.toContain(ids.noDue)
    expect(viewIds).not.toContain(ids.completed)
    expect(view).toHaveLength(2)
  })

  it('listUpcoming withinDays: 14 also includes +10', async () => {
    const ids = await seedFixture(orgId)
    const view = await todoService.listUpcoming({ organisationId: orgId, withinDays: 14 })
    const viewIds = view.map(t => t.id)

    expect(viewIds).toContain(ids.tomorrow)
    expect(viewIds).toContain(ids.plus5)
    expect(viewIds).toContain(ids.plus10)
    expect(view).toHaveLength(3)
    // Sort: due_at ASC.
    expect(viewIds).toEqual([ids.tomorrow, ids.plus5, ids.plus10])
  })

  it('listOpen returns every active todo (incl. no-due) but excludes completed', async () => {
    const ids = await seedFixture(orgId)
    const view = await todoService.listOpen({ organisationId: orgId })
    const viewIds = view.map(t => t.id)

    expect(viewIds).toContain(ids.overdue)
    expect(viewIds).toContain(ids.today)
    expect(viewIds).toContain(ids.tomorrow)
    expect(viewIds).toContain(ids.plus5)
    expect(viewIds).toContain(ids.plus10)
    expect(viewIds).toContain(ids.noDue)
    expect(viewIds).not.toContain(ids.completed)
    expect(view).toHaveLength(6)
  })

  it('listOpen sorts priority DESC, due_at ASC NULLS LAST', async () => {
    const ids = await seedFixture(orgId)
    const view = await todoService.listOpen({ organisationId: orgId })
    const viewIds = view.map(t => t.id)

    // Highest priority (urgent = 'today') comes first.
    expect(viewIds[0]).toBe(ids.today)
    // The 'no-due' row has priority 'high' so it sits in the high block, but
    // should land *after* the dated 'high' row (overdue) thanks to NULLS LAST.
    const overdueIdx = viewIds.indexOf(ids.overdue)
    const noDueIdx = viewIds.indexOf(ids.noDue)
    expect(overdueIdx).toBeLessThan(noDueIdx)
  })

  it('listCompleted returns only the completed row, sorted by completedAt DESC', async () => {
    const ids = await seedFixture(orgId)
    // Add a second completion that happened later so we can assert ordering.
    const second = await todoService.create({
      organisationId: orgId,
      title: 'Done later',
    })
    await todoService.complete(second.id)

    const view = await todoService.listCompleted({ organisationId: orgId })
    const viewIds = view.map(t => t.id)

    expect(viewIds).toContain(ids.completed)
    expect(viewIds).toContain(second.id)
    expect(view).toHaveLength(2)
    // Most recent completion first.
    expect(viewIds[0]).toBe(second.id)
    // None of the active fixtures appear.
    expect(viewIds).not.toContain(ids.overdue)
    expect(viewIds).not.toContain(ids.today)
    expect(viewIds).not.toContain(ids.tomorrow)
    expect(viewIds).not.toContain(ids.plus5)
    expect(viewIds).not.toContain(ids.plus10)
    expect(viewIds).not.toContain(ids.noDue)
  })

  it('priority filter composes with each view', async () => {
    const ids = await seedFixture(orgId)

    // Today view, only urgent → just `ids.today`.
    const today = await todoService.listToday({ organisationId: orgId, priority: 'urgent' })
    expect(today.map(t => t.id)).toEqual([ids.today])

    // Upcoming view, only medium → just `ids.tomorrow` (low is +5).
    const upcoming = await todoService.listUpcoming({ organisationId: orgId, priority: 'medium' })
    expect(upcoming.map(t => t.id)).toEqual([ids.tomorrow])

    // Open view, only high → overdue + noDue.
    const open = await todoService.listOpen({ organisationId: orgId, priority: 'high' })
    expect(open.map(t => t.id).sort()).toEqual([ids.overdue, ids.noDue].sort())

    // Completed view, only low → just the seeded completed row.
    const completed = await todoService.listCompleted({ organisationId: orgId, priority: 'low' })
    expect(completed.map(t => t.id)).toEqual([ids.completed])
  })

  it('tagId filter composes with each view', async () => {
    const ids = await seedFixture(orgId)
    // Tag a subset that hits all four views.
    await todoService.update(ids.overdue, { tagNames: ['focus'] })
    await todoService.update(ids.tomorrow, { tagNames: ['focus'] })
    await todoService.update(ids.noDue, { tagNames: ['focus'] })
    await todoService.update(ids.completed, { tagNames: ['focus'] })

    const tag = (await kbTagService.list({ organisationId: orgId }))
      .find(t => t.name === 'focus')!

    const today = await todoService.listToday({ organisationId: orgId, tagId: tag.id })
    expect(today.map(t => t.id)).toEqual([ids.overdue])

    const upcoming = await todoService.listUpcoming({ organisationId: orgId, tagId: tag.id })
    expect(upcoming.map(t => t.id)).toEqual([ids.tomorrow])

    const open = await todoService.listOpen({ organisationId: orgId, tagId: tag.id })
    expect(open.map(t => t.id).sort()).toEqual([ids.overdue, ids.tomorrow, ids.noDue].sort())

    const completed = await todoService.listCompleted({ organisationId: orgId, tagId: tag.id })
    expect(completed.map(t => t.id)).toEqual([ids.completed])
  })

  it('all four views are workspace-scoped', async () => {
    const otherOrg = (await setupOrg()).id
    await seedFixture(otherOrg) // noise — should never appear in `orgId` queries
    const ids = await seedFixture(orgId)

    const today = await todoService.listToday({ organisationId: orgId })
    expect(today.every(t => t.organisationId === orgId)).toBe(true)
    expect(today.map(t => t.id).sort()).toEqual([ids.overdue, ids.today].sort())

    const upcoming = await todoService.listUpcoming({ organisationId: orgId })
    expect(upcoming.every(t => t.organisationId === orgId)).toBe(true)
    expect(upcoming.map(t => t.id).sort()).toEqual([ids.tomorrow, ids.plus5].sort())

    const open = await todoService.listOpen({ organisationId: orgId })
    expect(open.every(t => t.organisationId === orgId)).toBe(true)
    expect(open).toHaveLength(6)

    const completed = await todoService.listCompleted({ organisationId: orgId })
    expect(completed.every(t => t.organisationId === orgId)).toBe(true)
    expect(completed.map(t => t.id)).toEqual([ids.completed])
  })

  it('soft-deleted todos are excluded from every view', async () => {
    const ids = await seedFixture(orgId)
    await todoService.softDelete(ids.today)
    await todoService.softDelete(ids.tomorrow)
    await todoService.softDelete(ids.noDue)
    await todoService.softDelete(ids.completed)

    const today = await todoService.listToday({ organisationId: orgId })
    expect(today.map(t => t.id)).not.toContain(ids.today)

    const upcoming = await todoService.listUpcoming({ organisationId: orgId })
    expect(upcoming.map(t => t.id)).not.toContain(ids.tomorrow)

    const open = await todoService.listOpen({ organisationId: orgId })
    expect(open.map(t => t.id)).not.toContain(ids.noDue)

    const completed = await todoService.listCompleted({ organisationId: orgId })
    expect(completed.map(t => t.id)).not.toContain(ids.completed)
  })

  it('getViewCounts matches the lengths of the corresponding lists', async () => {
    await seedFixture(orgId)
    const counts = await todoService.getViewCounts({ organisationId: orgId })

    const today = await todoService.listToday({ organisationId: orgId })
    const upcoming = await todoService.listUpcoming({ organisationId: orgId })
    const open = await todoService.listOpen({ organisationId: orgId })
    const completed = await todoService.listCompleted({ organisationId: orgId })

    expect(counts.today).toBe(today.length)
    expect(counts.upcoming).toBe(upcoming.length)
    expect(counts.open).toBe(open.length)
    expect(counts.completed).toBe(completed.length)
    expect(counts).toEqual({ today: 2, upcoming: 2, open: 6, completed: 1 })
  })
})

describe('todoService — purge', () => {
  let orgId: string

  beforeEach(async () => {
    orgId = (await setupOrg()).id
  })

  it('refuses to purge a live todo', async () => {
    const todo = await todoService.create({ organisationId: orgId, title: 'Alive' })
    await expect(
      todoService.purge({ id: todo.id, organisationId: orgId }),
    ).rejects.toBeInstanceOf(TodoCannotPurgeActiveError)
  })

  it('hard-deletes a soft-deleted todo and cascades to subtasks + junctions', async () => {
    const entry = await kbEntryService.create({ organisationId: orgId, title: 'KB' })
    const parent = await todoService.create({
      organisationId: orgId,
      title: 'Parent',
      tagNames: ['x'],
      kbEntryIds: [entry.id],
    })
    const child = await todoService.create({
      organisationId: orgId,
      title: 'Child',
      parentTodoId: parent.id,
    })

    // Junction rows exist before purge.
    expect(
      await db.select().from(schema.todoTags).where(eq(schema.todoTags.todoId, parent.id)),
    ).toHaveLength(1)
    expect(
      await db.select().from(schema.todoKbLinks).where(eq(schema.todoKbLinks.todoId, parent.id)),
    ).toHaveLength(1)

    await todoService.softDelete(parent.id)
    await todoService.purge({ id: parent.id, organisationId: orgId })

    // Parent gone.
    expect(await todosItemService.readOne(parent.id)).toBeNull()
    // Subtask cascaded.
    expect(await todosItemService.readOne(child.id)).toBeNull()
    // Junctions cascaded.
    expect(
      await db.select().from(schema.todoTags).where(eq(schema.todoTags.todoId, parent.id)),
    ).toHaveLength(0)
    expect(
      await db.select().from(schema.todoKbLinks).where(eq(schema.todoKbLinks.todoId, parent.id)),
    ).toHaveLength(0)
    // The unrelated KB entry is untouched.
    expect(await kbEntriesItemService.readOne(entry.id)).not.toBeNull()
  })
})
