<script setup lang="ts">
/**
 * Todo create / edit form (T-2.6, REQ-TODO-1..3).
 *
 * Single component used by both `app/pages/app/todos/new.vue` and
 * `app/pages/app/todos/[id]/edit.vue` — same "extract a form, two pages
 * reuse it" pattern as `KbEntryForm`.
 *
 * Editor stack:
 *   - Title: plain `UInput`.
 *   - Description: Nuxt UI `UEditor` in `content-type="markdown"` mode,
 *     same toolbar as the KB editor.
 *   - Priority: chip-style toggle group (small, ergonomic).
 *   - Due date: `UInputDate` bound to a `CalendarDateTime` (minute
 *     granularity); converted to/from ISO at the form boundary.
 *   - Parent: typeahead (`TodoParentPicker`) backed by
 *     `GET /api/todos?search=...&limit=10`. Self / descendant rejection is
 *     enforced server-side; any error surfaces here as a toast.
 *   - Tags: reuse `KbTagPicker` directly (ADR-008 — todos share `kb_tags`).
 *   - KB links: `TodoKbEntryPicker` — multi-select autocomplete against
 *     `GET /api/kb/entries?search=...&limit=10`.
 */
import type { EditorToolbarItem, FormSubmitEvent } from '@nuxt/ui'
import type {
  CreateTodoInput,
  Todo,
  TodoPriority,
  TodoWithRelations,
  UpdateTodoInput,
} from '../types/todo.types'
import { CalendarDateTime } from '@internationalized/date'
import * as z from 'zod'
import KbTagPicker from '~/features/kb/components/KbTagPicker.vue'
import { useKbEntry } from '~/features/kb/composables/useKbEntry'
import { useTodoById } from '../composables/useTodoById'
import { useCreateTodo, useUpdateTodo } from '../composables/useTodoMutations'
import { TODO_PRIORITIES } from '../types/todo.types'
import TodoKbEntryPicker from './TodoKbEntryPicker.vue'
import TodoParentPicker from './TodoParentPicker.vue'

const props = defineProps<{
  todo?: Todo | TodoWithRelations | null
  /**
   * Optional pre-filled parent for create mode (T-2.7 "+ Subtask" entry
   * point — `/app/todos/new?parentId=<id>`). Ignored in edit mode where
   * `props.todo.parentTodoId` already supplies the initial value.
   */
  initialParentTodoId?: string | null
  /**
   * Optional pre-filled KB-entry ids for create mode (T-2.8 "Create todo
   * from this entry" entry point — `/app/todos/new?kbEntryId=<id>`).
   * Ignored in edit mode where `props.todo.kbEntries` already supplies
   * the initial set.
   */
  initialKbEntryIds?: string[] | null
}>()

const emit = defineEmits<{
  success: [todo: Todo]
  cancel: []
}>()

const { t } = useI18n()
const toast = useToast()

const TITLE_MAX = 500
const DESCRIPTION_MAX = 200_000

const isEditMode = computed(() => Boolean(props.todo))

interface TodoFormState {
  title: string
  description: string
  priority: TodoPriority
  dueAt: string | null
  parentTodoId: string | null
  tagNames: string[]
  kbEntryIds: string[]
}

const isoToCalendarDateTime = (iso: string): CalendarDateTime => {
  const d = new Date(iso)
  return new CalendarDateTime(
    d.getFullYear(),
    d.getMonth() + 1,
    d.getDate(),
    d.getHours(),
    d.getMinutes(),
  )
}

const calendarDateTimeToIso = (cdt: CalendarDateTime): string =>
  new Date(cdt.year, cdt.month - 1, cdt.day, cdt.hour, cdt.minute).toISOString()

const initialTodo = props.todo as TodoWithRelations | null | undefined

// Edit mode wins; create mode falls back to the `initialKbEntryIds` prop
// (used by the "Create todo from this entry" flow from T-2.8). The route
// passes a single id today but the prop is plural so future fan-out from
// other entry points needs no further change here.
const initialKbEntryIdsForCreate = computed<string[]>(() => {
  if (initialTodo)
    return initialTodo.kbEntries?.map(entry => entry.id) ?? []
  return props.initialKbEntryIds ?? []
})

const state = reactive<TodoFormState>({
  title: initialTodo?.title ?? '',
  description: initialTodo?.descriptionMd ?? '',
  priority: initialTodo?.priority ?? 'medium',
  dueAt: initialTodo?.dueAt ?? null,
  // Edit mode wins; create mode falls back to the optional `initialParentTodoId`
  // prop (used by the "+ Subtask" navigate-with-prefill flow from T-2.7).
  parentTodoId: initialTodo?.parentTodoId ?? props.initialParentTodoId ?? null,
  tagNames: initialTodo?.tags?.map(tag => tag.name) ?? [],
  kbEntryIds: initialKbEntryIdsForCreate.value,
})

// `UInputDate` speaks `CalendarDateTime`; the schema-validated source of
// truth is `state.dueAt` (ISO string or null). This computed bridges the two.
const dueAtCdt = computed<CalendarDateTime | undefined>({
  get: () => (state.dueAt ? isoToCalendarDateTime(state.dueAt) : undefined),
  set: (value) => {
    state.dueAt = value ? calendarDateTimeToIso(value) : null
  },
})

/**
 * In create-mode-from-KB we have the entry id but not its title, so we lazily
 * fetch the entry to populate the picker chip. Edit mode already carries
 * hydrated `kbEntries` so no extra fetch is needed there.
 */
const kbLookupId = computed(() => {
  if (!isEditMode.value && props.initialKbEntryIds && props.initialKbEntryIds.length === 1)
    return props.initialKbEntryIds[0] ?? ''
  return ''
})

const { entry: kbLookupEntry } = useKbEntry(kbLookupId)

const initialKbOptions = computed(() => {
  if (initialTodo)
    return initialTodo.kbEntries?.map(entry => ({ id: entry.id, title: entry.title })) ?? []
  if (kbLookupEntry.value)
    return [{ id: kbLookupEntry.value.id, title: kbLookupEntry.value.title }]
  return []
})

/**
 * Resolve the initial parent option for the picker.
 *
 *   - Edit mode: derive directly from `props.todo` (the parent id is known
 *     but not its title, so we fetch lazily; `useTodoById` is enabled only
 *     when an id is present).
 *   - Create mode + `initialParentTodoId`: same lazy fetch via the by-id
 *     query so the picker chip shows the parent's title before the user
 *     types anything into the dropdown search.
 */
const parentLookupId = computed(() => {
  if (initialTodo?.parentTodoId)
    return initialTodo.parentTodoId
  if (!isEditMode.value && props.initialParentTodoId)
    return props.initialParentTodoId
  return ''
})

const { todo: parentTodoLookup } = useTodoById(parentLookupId)

const initialParentOption = computed<{ id: string, title: string } | null>(() => {
  if (parentTodoLookup.value)
    return { id: parentTodoLookup.value.id, title: parentTodoLookup.value.title }
  return null
})

const schema = z.object({
  title: z.string().trim().min(1, t('todo.form.errors.titleRequired')).max(TITLE_MAX),
  description: z.string().max(DESCRIPTION_MAX),
  priority: z.enum(TODO_PRIORITIES as unknown as [TodoPriority, ...TodoPriority[]]),
  dueAt: z.string().nullable(),
  parentTodoId: z.string().nullable(),
  tagNames: z.array(z.string().trim().min(1).max(50)),
  kbEntryIds: z.array(z.string().trim().min(1)),
})

type Schema = z.output<typeof schema>

const priorityItems = computed(() =>
  TODO_PRIORITIES.map(value => ({
    value,
    label: t(`todo.priority.${value}`),
  })),
)

const priorityColor = (value: TodoPriority) => {
  switch (value) {
    case 'urgent': return 'error' as const
    case 'high': return 'warning' as const
    case 'medium': return 'neutral' as const
    case 'low': return 'info' as const
  }
}

const toolbarItems: EditorToolbarItem[][] = [
  [
    { kind: 'undo', icon: 'i-lucide-undo', tooltip: { text: 'Undo' } },
    { kind: 'redo', icon: 'i-lucide-redo', tooltip: { text: 'Redo' } },
  ],
  [
    {
      icon: 'i-lucide-heading',
      tooltip: { text: 'Headings' },
      content: { align: 'start' },
      items: [
        { kind: 'heading', level: 1, icon: 'i-lucide-heading-1', label: 'Heading 1' },
        { kind: 'heading', level: 2, icon: 'i-lucide-heading-2', label: 'Heading 2' },
        { kind: 'heading', level: 3, icon: 'i-lucide-heading-3', label: 'Heading 3' },
      ],
    },
    { kind: 'bulletList', icon: 'i-lucide-list', tooltip: { text: 'Bullet List' } },
    { kind: 'orderedList', icon: 'i-lucide-list-ordered', tooltip: { text: 'Ordered List' } },
    { kind: 'blockquote', icon: 'i-lucide-text-quote', tooltip: { text: 'Blockquote' } },
    { kind: 'codeBlock', icon: 'i-lucide-square-code', tooltip: { text: 'Code Block' } },
    { kind: 'horizontalRule', icon: 'i-lucide-separator-horizontal', tooltip: { text: 'Horizontal Rule' } },
  ],
  [
    { kind: 'mark', mark: 'bold', icon: 'i-lucide-bold', tooltip: { text: 'Bold' } },
    { kind: 'mark', mark: 'italic', icon: 'i-lucide-italic', tooltip: { text: 'Italic' } },
    { kind: 'mark', mark: 'strike', icon: 'i-lucide-strikethrough', tooltip: { text: 'Strikethrough' } },
    { kind: 'mark', mark: 'code', icon: 'i-lucide-code', tooltip: { text: 'Code' } },
  ],
  [
    { kind: 'link', icon: 'i-lucide-link', tooltip: { text: 'Link' } },
  ],
]

const { mutateAsync: createTodo, asyncStatus: createStatus, error: createError } = useCreateTodo()
const { mutateAsync: updateTodo, asyncStatus: updateStatus, error: updateError } = useUpdateTodo()

const isLoading = computed(
  () => createStatus.value === 'loading' || updateStatus.value === 'loading',
)

const apiError = computed(() => {
  const err = (createError.value || updateError.value) as
    | { statusCode?: number, data?: { statusMessage?: string }, message?: string }
    | null
  if (!err)
    return null
  const msg = err.data?.statusMessage || err.message || ''
  if (msg.includes('depth') || msg.includes('Depth'))
    return t('todo.form.errors.parentDepth')
  if (err.statusCode === 404 && msg.includes('parent'))
    return t('todo.form.errors.parentMissing')
  return err.data?.statusMessage || err.message || t('todo.form.errors.generic')
})

const onSubmit = async (event: FormSubmitEvent<Schema>) => {
  try {
    if (isEditMode.value && props.todo) {
      const payload: UpdateTodoInput = {
        title: event.data.title,
        description: event.data.description.length > 0 ? event.data.description : null,
        priority: event.data.priority,
        dueAt: event.data.dueAt,
        parentTodoId: event.data.parentTodoId,
        tagNames: event.data.tagNames,
        kbEntryIds: event.data.kbEntryIds,
      }
      const { todo } = await updateTodo({ id: props.todo.id, data: payload })
      toast.add({ title: t('todo.form.toast.updated'), color: 'success' })
      emit('success', todo)
    }
    else {
      const payload: CreateTodoInput = {
        title: event.data.title,
        description: event.data.description.length > 0 ? event.data.description : null,
        priority: event.data.priority,
        dueAt: event.data.dueAt,
        parentTodoId: event.data.parentTodoId,
        tagNames: event.data.tagNames,
        kbEntryIds: event.data.kbEntryIds,
      }
      const { todo } = await createTodo(payload)
      toast.add({ title: t('todo.form.toast.created'), color: 'success' })
      emit('success', todo)
    }
  }
  catch {
    toast.add({ title: t('todo.form.toast.error'), color: 'error' })
  }
}
</script>

<template>
  <UForm
    id="todo-form"
    :schema="schema"
    :state="state"
    class="space-y-4"
    @submit="onSubmit"
  >
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-1"
    >
      <UAlert
        v-if="apiError"
        color="error"
        variant="subtle"
        icon="i-lucide-alert-triangle"
        :title="apiError"
      />
    </Transition>

    <div class="flex justify-end gap-2">
      <UButton
        variant="ghost"
        color="neutral"
        size="sm"
        :disabled="isLoading"
        @click="emit('cancel')"
      >
        {{ t('todo.form.actions.cancel') }}
      </UButton>
      <UButton
        form="todo-form"
        type="submit"
        size="sm"
        :loading="isLoading"
      >
        {{ isEditMode ? t('todo.form.actions.update') : t('todo.form.actions.create') }}
      </UButton>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <!-- Main column -->
      <div class="lg:col-span-8 space-y-4">
        <UFormField
          name="title"
          :label="t('todo.form.title.label')"
          required
        >
          <UInput
            v-model="state.title"
            :placeholder="t('todo.form.title.placeholder')"
            size="xl"
            :maxlength="TITLE_MAX"
            class="w-full"
          />
        </UFormField>

        <UFormField
          name="description"
          :label="t('todo.form.description.label')"
          :hint="t('todo.form.description.hint')"
        >
          <UEditor
            v-slot="{ editor }"
            v-model="state.description"
            content-type="markdown"
            :placeholder="t('todo.form.description.placeholder')"
            class="w-full min-h-64 flex flex-col gap-4 rounded-lg bg-elevated/50 ring ring-default p-4"
          >
            <UEditorToolbar :editor="editor" :items="toolbarItems" class="pb-4 border-b border-default" />
          </UEditor>
        </UFormField>
      </div>

      <!-- Sidebar -->
      <div class="lg:col-span-4 space-y-4">
        <UPageCard :title="t('todo.form.priority.label')" variant="subtle">
          <UFormField name="priority">
            <div class="flex flex-wrap gap-1.5">
              <UButton
                v-for="item in priorityItems"
                :key="item.value"
                size="xs"
                :variant="state.priority === item.value ? 'solid' : 'soft'"
                :color="priorityColor(item.value)"
                @click="state.priority = item.value"
              >
                {{ item.label }}
              </UButton>
            </div>
          </UFormField>
        </UPageCard>

        <UPageCard :title="t('todo.form.dueAt.label')" variant="subtle">
          <UFormField name="dueAt" :hint="t('todo.form.dueAt.hint')">
            <div class="flex items-center gap-2">
              <UInputDate
                v-model="dueAtCdt"
                granularity="minute"
                :hide-time-zone="true"
                size="sm"
                class="flex-1"
              />
              <UButton
                v-if="state.dueAt"
                variant="ghost"
                color="neutral"
                size="xs"
                icon="i-lucide-x"
                :aria-label="t('todo.form.dueAt.clear')"
                @click="state.dueAt = null"
              />
            </div>
          </UFormField>
        </UPageCard>

        <UPageCard :title="t('todo.form.parent.label')" variant="subtle">
          <UFormField name="parentTodoId" :hint="t('todo.form.parent.hint')">
            <TodoParentPicker
              v-model="state.parentTodoId"
              :exclude-id="props.todo?.id ?? null"
              :initial-option="initialParentOption"
            />
          </UFormField>
        </UPageCard>

        <UPageCard :title="t('todo.form.tags.label')" variant="subtle">
          <UFormField name="tagNames">
            <KbTagPicker v-model="state.tagNames" />
          </UFormField>
        </UPageCard>

        <UPageCard :title="t('todo.form.kbLinks.label')" variant="subtle">
          <UFormField name="kbEntryIds" :hint="t('todo.form.kbLinks.hint')">
            <TodoKbEntryPicker
              v-model="state.kbEntryIds"
              :initial-options="initialKbOptions"
            />
          </UFormField>
        </UPageCard>
      </div>
    </div>
  </UForm>
</template>
