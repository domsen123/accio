<script setup lang="ts">
/**
 * Todo create page (T-2.6) — `/app/todos/new`.
 *
 * Mounts the shared `TodoForm` in create mode and navigates to the new
 * todo's detail page on success. The form owns its own toast for the
 * create/update outcome; this page only handles navigation.
 *
 * T-2.7: an optional `?parentId=<id>` query is forwarded to the form as
 * `initialParentTodoId` so the "+ Subtask" affordance in the recursive
 * subtask list lands on a pre-parented create form. After the create
 * succeeds we still navigate to the new todo's detail page.
 */
import type { Todo } from '~/features/todo/types/todo.types'
import TodoForm from '~/features/todo/components/TodoForm.vue'

definePageMeta({
  layout: 'app',
  auth: true,
})

const { t } = useI18n()
const router = useRouter()
const route = useRoute()

useSeoMeta({
  title: () => t('todo.form.create.title'),
})

const initialParentTodoId = computed<string | null>(() => {
  const raw = route.query.parentId
  if (typeof raw === 'string' && raw.trim().length > 0)
    return raw.trim()
  if (Array.isArray(raw) && typeof raw[0] === 'string' && raw[0]!.trim().length > 0)
    return raw[0]!.trim()
  return null
})

const onSuccess = (todo: Todo) => {
  router.push(`/app/todos/${encodeURIComponent(todo.id)}`)
}

const onCancel = () => {
  // If we came from a parent ("+ Subtask"), bouncing to the parent's detail
  // page is a friendlier exit than the flat list — the user already had a
  // mental model of the parent.
  if (initialParentTodoId.value)
    router.push(`/app/todos/${encodeURIComponent(initialParentTodoId.value)}`)
  else
    router.push('/app/todos')
}
</script>

<template>
  <div class="p-4 md:p-6 space-y-6">
    <div class="flex items-center justify-between gap-3 flex-wrap">
      <div>
        <h1 class="text-2xl font-bold text-highlighted">
          {{ t('todo.form.create.title') }}
        </h1>
        <p class="text-muted text-sm mt-1">
          {{ t('todo.form.create.subtitle') }}
        </p>
      </div>
      <UButton
        to="/app/todos"
        variant="ghost"
        color="neutral"
        icon="i-lucide-arrow-left"
        :label="t('todo.form.backToList')"
      />
    </div>
    <TodoForm
      :initial-parent-todo-id="initialParentTodoId"
      @success="onSuccess"
      @cancel="onCancel"
    />
  </div>
</template>
