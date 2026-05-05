<script setup lang="ts">
/**
 * Todo edit page (T-2.6) — `/app/todos/[id]/edit`.
 *
 * Loads the hydrated todo via `useTodoById` (tags + KB links + subtask
 * count), mounts the shared `TodoForm` in edit mode, and navigates back
 * to the detail page on success.
 */
import type { Todo } from '~/features/todo/types/todo.types'
import TodoForm from '~/features/todo/components/TodoForm.vue'
import { useTodoById } from '~/features/todo/composables/useTodoById'

definePageMeta({
  layout: 'app',
  auth: true,
})

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const id = computed(() => String(route.params.id ?? ''))

const { todo, isLoading, error } = useTodoById(id)

useSeoMeta({
  title: () => todo.value
    ? t('todo.form.edit.title', { title: todo.value.title })
    : t('todo.form.edit.fallback'),
})

const onSuccess = (saved: Todo) => {
  router.push(`/app/todos/${encodeURIComponent(saved.id)}`)
}

const onCancel = () => {
  if (todo.value)
    router.push(`/app/todos/${encodeURIComponent(todo.value.id)}`)
  else
    router.push('/app/todos')
}
</script>

<template>
  <div class="p-4 md:p-6 space-y-6">
    <div class="flex items-center justify-between gap-3 flex-wrap">
      <div>
        <h1 class="text-2xl font-bold text-highlighted">
          {{ t('todo.form.edit.heading') }}
        </h1>
        <p v-if="todo" class="text-muted text-sm mt-1 truncate max-w-2xl">
          {{ todo.title }}
        </p>
      </div>
      <UButton
        :to="todo ? `/app/todos/${encodeURIComponent(todo.id)}` : '/app/todos'"
        variant="ghost"
        color="neutral"
        icon="i-lucide-arrow-left"
        :label="t('todo.form.edit.backToTodo')"
      />
    </div>

    <div v-if="isLoading" class="space-y-4">
      <USkeleton class="h-8 w-3/4" />
      <USkeleton class="h-64 w-full" />
    </div>

    <UAlert
      v-else-if="error"
      color="error"
      variant="soft"
      icon="i-lucide-alert-circle"
      :title="t('todo.detail.error.title')"
      :description="error.message"
    />

    <TodoForm
      v-else-if="todo"
      :todo="todo"
      @success="onSuccess"
      @cancel="onCancel"
    />
  </div>
</template>
