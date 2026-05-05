<script setup lang="ts">
/**
 * Todo create page (T-2.6) — `/app/todos/new`.
 *
 * Mounts the shared `TodoForm` in create mode and navigates to the new
 * todo's detail page on success. The form owns its own toast for the
 * create/update outcome; this page only handles navigation.
 */
import type { Todo } from '~/features/todo/types/todo.types'
import TodoForm from '~/features/todo/components/TodoForm.vue'

definePageMeta({
  layout: 'app',
  auth: true,
})

const { t } = useI18n()
const router = useRouter()

useSeoMeta({
  title: () => t('todo.form.create.title'),
})

const onSuccess = (todo: Todo) => {
  router.push(`/app/todos/${encodeURIComponent(todo.id)}`)
}

const onCancel = () => {
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
      @success="onSuccess"
      @cancel="onCancel"
    />
  </div>
</template>
