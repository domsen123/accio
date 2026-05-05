<script setup lang="ts">
/**
 * Todo edit page (T-2.6) — `/app/todos/[id]/edit`.
 *
 * Loads the hydrated todo via `useTodoById` (tags + KB links + subtask
 * count), mounts the shared `TodoForm` in edit mode, and navigates back
 * to the detail page on success.
 */
import type { BreadcrumbItem } from '@nuxt/ui'
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

const breadcrumbItems = computed<BreadcrumbItem[]>(() => {
  const items: BreadcrumbItem[] = [{ label: t('todo.list.title'), to: '/app/todos' }]
  if (todo.value) {
    items.push({
      label: todo.value.title,
      to: `/app/todos/${encodeURIComponent(todo.value.id)}`,
    })
  }
  items.push({ label: t('todo.form.edit.heading') })
  return items
})
</script>

<template>
  <UPage>
    <UPageHeader
      :title="t('todo.form.edit.heading')"
      :description="todo?.title"
      :ui="{ root: 'border-none' }"
    >
      <template #headline>
        <UBreadcrumb :items="breadcrumbItems" />
      </template>
    </UPageHeader>

    <UPage>
      <div class="space-y-6">
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
    </UPage>
  </UPage>
</template>
