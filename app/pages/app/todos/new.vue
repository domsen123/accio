<script setup lang="ts">
/**
 * Todo create page (T-2.6 / T-2.7 / T-2.8) — `/app/todos/new`.
 *
 * Mounts the shared `TodoForm` in create mode and navigates to the new
 * todo's detail page on success. The form owns its own toast for the
 * create/update outcome; this page only handles navigation.
 *
 * Query-param shortcuts:
 *   - `?parentId=<id>` (T-2.7) — pre-parented create form for "+ Subtask"
 *     from the recursive subtask list. Cancel bounces to the parent.
 *   - `?kbEntryId=<id>` (T-2.8) — pre-linked KB entry for "Create todo from
 *     this entry" on the KB detail page. Cancel bounces to that entry.
 */
import type { BreadcrumbItem } from '@nuxt/ui'
import type { Todo } from '~/features/todo/types/todo.types'
import { useKbEntry } from '~/features/kb/composables/useKbEntry'
import TodoForm from '~/features/todo/components/TodoForm.vue'

definePageMeta({
  layout: 'app',
  auth: true,
})

const { t } = useI18n()
const router = useRouter()
const route = useRoute()

const initialParentTodoId = computed<string | null>(() => {
  const raw = route.query.parentId
  if (typeof raw === 'string' && raw.trim().length > 0)
    return raw.trim()
  if (Array.isArray(raw) && typeof raw[0] === 'string' && raw[0]!.trim().length > 0)
    return raw[0]!.trim()
  return null
})

const initialKbEntryId = computed<string | null>(() => {
  const raw = route.query.kbEntryId
  if (typeof raw === 'string' && raw.trim().length > 0)
    return raw.trim()
  if (Array.isArray(raw) && typeof raw[0] === 'string' && raw[0]!.trim().length > 0)
    return raw[0]!.trim()
  return null
})

const initialKbEntryIds = computed<string[] | null>(() =>
  initialKbEntryId.value ? [initialKbEntryId.value] : null,
)

// Resolve the entry for the cancel-bounce (we need the slug, not just the id).
const kbCancelLookupId = computed(() => initialKbEntryId.value ?? '')
const { entry: kbCancelEntry } = useKbEntry(kbCancelLookupId)

const isFromKb = computed(() => Boolean(initialKbEntryId.value))

useSeoMeta({
  title: () => t('todo.form.create.title'),
})

const onSuccess = (todo: Todo) => {
  router.push(`/app/todos/${encodeURIComponent(todo.id)}`)
}

const onCancel = () => {
  // If we came from a KB entry ("Create todo from this entry"), bounce back
  // to that entry — the user just left it in their head.
  if (kbCancelEntry.value) {
    router.push(`/app/kb/${encodeURIComponent(kbCancelEntry.value.slug)}`)
    return
  }
  // If we came from a parent ("+ Subtask"), bouncing to the parent's detail
  // page is a friendlier exit than the flat list — the user already had a
  // mental model of the parent.
  if (initialParentTodoId.value)
    router.push(`/app/todos/${encodeURIComponent(initialParentTodoId.value)}`)
  else
    router.push('/app/todos')
}

const breadcrumbItems = computed<BreadcrumbItem[]>(() => [
  { label: t('todo.list.title'), to: '/app/todos' },
  { label: t('todo.form.create.title') },
])
</script>

<template>
  <UPage>
    <UPageHeader
      :title="t('todo.form.create.title')"
      :description="isFromKb
        ? t('todo.form.create.fromKb.subtitle')
        : t('todo.form.create.subtitle')"
      :ui="{ root: 'border-none' }"
    >
      <template #headline>
        <UBreadcrumb :items="breadcrumbItems" />
      </template>
    </UPageHeader>

    <UPage>
      <TodoForm
        :initial-parent-todo-id="initialParentTodoId"
        :initial-kb-entry-ids="initialKbEntryIds"
        @success="onSuccess"
        @cancel="onCancel"
      />
    </UPage>
  </UPage>
</template>
