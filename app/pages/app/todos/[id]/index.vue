<script setup lang="ts">
/**
 * Todo detail page (T-2.6) — `/app/todos/[id]`.
 *
 * Read-only view that the create / edit flows redirect into. Renders the
 * todo's title + priority badge, a Markdown-rendered description, due
 * date, tags, linked KB entries (as clickable chips), an immediate
 * subtask count placeholder (full subtask UI is T-2.7), and Edit /
 * Complete actions.
 *
 * The Markdown body renders with the same `renderKbMarkdown` helper as
 * the KB preview pane so wikilinks resolve identically — todos are first-
 * class citizens in the wikilink graph for cross-domain references.
 */
import { renderKbMarkdown } from '~/features/kb/utils/renderMarkdown'
import TodoSubtaskList from '~/features/todo/components/TodoSubtaskList.vue'
import TodoSubtaskProgress from '~/features/todo/components/TodoSubtaskProgress.vue'
import { useTodoById } from '~/features/todo/composables/useTodoById'
import {
  useCompleteTodo,
  useUncompleteTodo,
} from '~/features/todo/composables/useTodoMutations'

definePageMeta({
  layout: 'app',
  auth: true,
})

const { t, locale } = useI18n()
const toast = useToast()
const route = useRoute()

const id = computed(() => String(route.params.id ?? ''))

const { todo, isLoading, error } = useTodoById(id)

useSeoMeta({
  title: () => todo.value
    ? t('todo.detail.title', { title: todo.value.title })
    : t('todo.detail.fallback'),
})

const isCompleted = computed(() => Boolean(todo.value?.completedAt))

const priorityColor = computed(() => {
  switch (todo.value?.priority) {
    case 'urgent': return 'error' as const
    case 'high': return 'warning' as const
    case 'medium': return 'neutral' as const
    case 'low': return 'info' as const
    default: return 'neutral' as const
  }
})

const formatDate = (iso: string | null): string => {
  if (!iso)
    return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime()))
    return ''
  return new Intl.DateTimeFormat(locale.value, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d)
}

/**
 * Markdown rendering — reuse the KB renderer so wikilinks behave the same
 * way. The todo description is short, so we don't bother with bulk-resolve;
 * unresolved links just render with the dotted-underline style.
 */
const descriptionHtml = computed(() => {
  const body = todo.value?.descriptionMd ?? ''
  if (!body.trim())
    return ''
  return renderKbMarkdown(body, {
    isResolved: () => false,
    hrefFor: (slug: string) => `/app/kb/${encodeURIComponent(slug)}`,
  })
})

const completeMutation = useCompleteTodo()
const uncompleteMutation = useUncompleteTodo()

const onToggleComplete = async () => {
  if (!todo.value)
    return
  const wasCompleted = isCompleted.value
  try {
    if (wasCompleted)
      await uncompleteMutation.mutateAsync(todo.value.id)
    else
      await completeMutation.mutateAsync(todo.value.id)
    toast.add({
      title: wasCompleted
        ? t('todo.actions.uncomplete.toast.success')
        : t('todo.actions.complete.toast.success'),
      color: 'success',
    })
  }
  catch {
    toast.add({
      title: wasCompleted
        ? t('todo.actions.uncomplete.toast.error')
        : t('todo.actions.complete.toast.error'),
      color: 'error',
    })
  }
}
</script>

<template>
  <div class="p-4 md:p-6 space-y-6">
    <div class="flex items-center justify-between gap-3 flex-wrap">
      <UButton
        to="/app/todos"
        variant="ghost"
        color="neutral"
        icon="i-lucide-arrow-left"
        :label="t('todo.detail.backToList')"
      />
    </div>

    <div v-if="isLoading" class="space-y-4">
      <USkeleton class="h-8 w-2/3" />
      <USkeleton class="h-32 w-full" />
    </div>

    <UAlert
      v-else-if="error"
      color="error"
      variant="soft"
      icon="i-lucide-alert-circle"
      :title="t('todo.detail.error.title')"
      :description="error.message"
    />

    <div v-else-if="todo" class="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div class="lg:col-span-8 space-y-6">
        <div class="space-y-2">
          <div class="flex items-center gap-2 flex-wrap">
            <h1
              class="text-2xl font-bold text-highlighted"
              :class="{ 'line-through text-muted': isCompleted }"
            >
              {{ todo.title }}
            </h1>
            <UBadge :color="priorityColor" variant="subtle" size="sm">
              {{ t(`todo.priority.${todo.priority}`) }}
            </UBadge>
          </div>
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            <span v-if="todo.dueAt">
              <UIcon name="i-lucide-calendar" class="size-4 align-text-bottom mr-1" />
              {{ t('todo.detail.dueAt', { date: formatDate(todo.dueAt) }) }}
            </span>
            <span v-if="isCompleted && todo.completedAt">
              <UIcon name="i-lucide-check" class="size-4 align-text-bottom mr-1" />
              {{ t('todo.detail.completedAt', { date: formatDate(todo.completedAt) }) }}
            </span>
          </div>
        </div>

        <UCard>
          <template #header>
            <h2 class="text-sm font-semibold">
              {{ t('todo.detail.description') }}
            </h2>
          </template>
          <p v-if="!descriptionHtml" class="italic text-muted text-sm">
            {{ t('todo.detail.descriptionEmpty') }}
          </p>
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div
            v-else
            class="kb-markdown-preview prose prose-neutral dark:prose-invert max-w-none text-sm"
            v-html="descriptionHtml"
          />
        </UCard>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-2 flex-wrap">
              <div class="flex items-center gap-2">
                <h2 class="text-sm font-semibold">
                  {{ t('todo.detail.subtasks.title') }}
                </h2>
                <TodoSubtaskProgress :parent-todo-id="todo.id" size="sm" />
              </div>
              <UButton
                size="xs"
                icon="i-lucide-plus"
                :label="t('todo.subtask.add')"
                :to="`/app/todos/new?parentId=${encodeURIComponent(todo.id)}`"
              />
            </div>
          </template>
          <TodoSubtaskList :parent-todo-id="todo.id" :depth="1" />
        </UCard>
      </div>

      <div class="lg:col-span-4 space-y-4">
        <UPageCard :title="t('todo.detail.actions.title')" variant="subtle">
          <div class="space-y-2">
            <UButton
              :to="`/app/todos/${encodeURIComponent(todo.id)}/edit`"
              icon="i-lucide-pencil"
              :label="t('todo.actions.edit')"
              block
            />
            <UButton
              :icon="isCompleted ? 'i-lucide-rotate-ccw' : 'i-lucide-check'"
              :label="isCompleted
                ? t('todo.actions.uncomplete.label')
                : t('todo.actions.complete.label')"
              variant="outline"
              :color="isCompleted ? 'neutral' : 'success'"
              block
              @click="onToggleComplete"
            />
          </div>
        </UPageCard>

        <UPageCard
          v-if="todo.tags && todo.tags.length > 0"
          :title="t('todo.form.tags.label')"
          variant="subtle"
        >
          <div class="flex flex-wrap gap-1.5">
            <UBadge
              v-for="tag in todo.tags"
              :key="tag.id"
              color="neutral"
              variant="subtle"
              size="sm"
            >
              <UIcon name="i-lucide-tag" class="size-3 mr-1" />
              {{ tag.name }}
            </UBadge>
          </div>
        </UPageCard>

        <UPageCard
          v-if="todo.kbEntries && todo.kbEntries.length > 0"
          :title="t('todo.detail.kbLinks.title')"
          variant="subtle"
        >
          <div class="flex flex-col gap-1.5">
            <NuxtLink
              v-for="entry in todo.kbEntries"
              :key="entry.id"
              :to="`/app/kb/${encodeURIComponent(entry.slug)}`"
              class="text-sm text-primary hover:underline truncate"
            >
              <UIcon name="i-lucide-link" class="size-3.5 align-text-bottom mr-1" />
              {{ entry.title }}
            </NuxtLink>
          </div>
        </UPageCard>
      </div>
    </div>
  </div>
</template>
