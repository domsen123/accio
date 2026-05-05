<script setup lang="ts">
/**
 * KB entry detail page (T-1.8 / T-1.9 / T-2.8) — `/app/kb/[slug]`.
 *
 * Renders title, metadata (status / author / source / category / tags), the
 * Markdown body, a Backlinks panel, and a Linked-todos panel (T-2.8,
 * REQ-TODO-3) — the KB-side of the Todo↔KB cross-display.
 *
 * Markdown body is rendered via `KbMarkdownPreview` (T-1.9) so wikilinks
 * resolve consistently with the editor preview: resolved links are real
 * `<a href>`s; unresolved links are visually distinct but still link to the
 * target slug so the user can create the missing entry from the preview.
 *
 * Linked-todos: the KB-side display is read-only — adding new links happens
 * from the Todo side (the picker in `TodoForm`), or via the
 * "Create todo from this entry" shortcut here which navigates to
 * `/app/todos/new?kbEntryId=<id>` and prefills `kbEntryIds`. Per REQ-TODO-3
 * the linking direction is one-way in the UI; the junction table is
 * symmetric server-side.
 *
 * Delete remains a disabled stub; the trash workflow lands in T-1.10.
 */
import type { KbEntryStatus, KbLinkedTodoSummary } from '~/features/kb/types/kb.types'
import KbMarkdownPreview from '~/features/kb/components/KbMarkdownPreview.vue'
import { useKbLinkedTodos } from '~/features/kb/composables/useKbLinkedTodos'
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

const slug = computed(() => String(route.params.slug ?? ''))

const { entry, isLoading, error } = useKbEntry(slug)

const entryId = computed(() => entry.value?.id ?? null)
const { backlinks } = useKbBacklinks(entryId)

// Linked todos (T-2.8). Default excludes completed; the user toggles this
// inline. The query key includes the flag so a toggle re-fetches with the
// matching server filter rather than client-side filtering a stale list.
const includeCompletedTodos = ref(false)
const linkedTodosParams = computed(() =>
  includeCompletedTodos.value ? { includeCompleted: true } : undefined,
)
const {
  linkedTodos,
  isLoading: linkedTodosLoading,
  error: linkedTodosError,
} = useKbLinkedTodos(entryId, linkedTodosParams)

useSeoMeta({
  title: () => entry.value?.title ?? t('kb.detail.title.fallback'),
})

const statusBadgeColor = (value: KbEntryStatus) => {
  switch (value) {
    case 'inbox': return 'warning' as const
    case 'draft': return 'neutral' as const
    case 'verified': return 'success' as const
    case 'archived': return 'neutral' as const
  }
}

const formatDate = (iso: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime()))
    return ''
  return d.toLocaleString(locale.value, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// --- Linked-todos rendering helpers (T-2.8) ---

const priorityColor = (value: KbLinkedTodoSummary['priority']) => {
  switch (value) {
    case 'urgent': return 'error' as const
    case 'high': return 'warning' as const
    case 'medium': return 'neutral' as const
    case 'low': return 'info' as const
  }
}

const formatRelative = (iso: string | null): string => {
  if (!iso)
    return ''
  const target = new Date(iso).getTime()
  if (Number.isNaN(target))
    return ''
  const diffMs = target - Date.now()
  const diffSec = Math.round(diffMs / 1000)
  const rtf = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' })
  const abs = Math.abs(diffSec)
  if (abs < 60)
    return rtf.format(diffSec, 'second')
  if (abs < 3600)
    return rtf.format(Math.round(diffSec / 60), 'minute')
  if (abs < 86_400)
    return rtf.format(Math.round(diffSec / 3600), 'hour')
  if (abs < 2_592_000)
    return rtf.format(Math.round(diffSec / 86_400), 'day')
  if (abs < 31_104_000)
    return rtf.format(Math.round(diffSec / 2_592_000), 'month')
  return rtf.format(Math.round(diffSec / 31_104_000), 'year')
}

const isOverdue = (todo: KbLinkedTodoSummary): boolean => {
  if (!todo.dueAt || todo.completedAt)
    return false
  const due = new Date(todo.dueAt).getTime()
  if (Number.isNaN(due))
    return false
  return due < Date.now()
}

const completeMutation = useCompleteTodo()
const uncompleteMutation = useUncompleteTodo()
const pendingTodoId = ref<string | null>(null)

const onToggleTodoComplete = async (todo: KbLinkedTodoSummary) => {
  pendingTodoId.value = todo.id
  const wasCompleted = Boolean(todo.completedAt)
  try {
    if (wasCompleted)
      await uncompleteMutation.mutateAsync(todo.id)
    else
      await completeMutation.mutateAsync(todo.id)
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
  finally {
    pendingTodoId.value = null
  }
}

const createTodoFromEntryHref = computed(() => {
  if (!entry.value)
    return '/app/todos/new'
  return `/app/todos/new?kbEntryId=${encodeURIComponent(entry.value.id)}`
})
</script>

<template>
  <div class="p-4 md:p-6 space-y-6 max-w-4xl">
    <!-- Back link -->
    <UButton
      to="/app/kb"
      variant="ghost"
      color="neutral"
      icon="i-lucide-arrow-left"
      size="sm"
      :label="t('kb.detail.back')"
    />

    <!-- Loading -->
    <div v-if="isLoading" class="space-y-4">
      <USkeleton class="h-8 w-3/4" />
      <USkeleton class="h-4 w-1/3" />
      <USkeleton class="h-64 w-full" />
    </div>

    <!-- Error / not found -->
    <UAlert
      v-else-if="error"
      color="error"
      variant="soft"
      :title="t('kb.detail.error.title')"
      :description="error.message"
      icon="i-lucide-alert-circle"
    />

    <!-- Entry -->
    <template v-else-if="entry">
      <div class="space-y-3">
        <div class="flex items-start justify-between gap-3 flex-wrap">
          <h1 class="text-2xl md:text-3xl font-bold text-highlighted">
            {{ entry.title }}
          </h1>
          <div class="flex items-center gap-2">
            <UButton
              variant="outline"
              color="neutral"
              icon="i-lucide-pencil"
              :label="t('kb.detail.edit')"
              :to="`/app/kb/${encodeURIComponent(entry.slug)}/edit`"
            />
            <UButton
              variant="outline"
              color="error"
              icon="i-lucide-trash-2"
              :label="t('kb.detail.delete')"
              disabled
            />
          </div>
        </div>

        <!-- Metadata row -->
        <div class="flex flex-wrap items-center gap-2 text-sm text-muted">
          <UBadge
            :color="statusBadgeColor(entry.status)"
            variant="subtle"
            size="sm"
          >
            {{ t(`kb.status.${entry.status}`) }}
          </UBadge>
          <UBadge
            v-if="entry.category"
            variant="outline"
            size="sm"
            icon="i-lucide-folder"
          >
            {{ entry.category.name }}
          </UBadge>
          <UBadge
            v-for="tag in entry.tags ?? []"
            :key="tag.id"
            variant="subtle"
            color="neutral"
            size="sm"
          >
            {{ tag.name }}
          </UBadge>
          <span class="inline-flex items-center gap-1">
            <UIcon
              :name="entry.authorType === 'ai' ? 'i-lucide-sparkles' : 'i-lucide-user'"
              class="size-3.5"
            />
            {{ t(`kb.author.${entry.authorType}`) }}
            <span v-if="entry.authorName">— {{ entry.authorName }}</span>
          </span>
          <span class="inline-flex items-center gap-1">
            <UIcon name="i-lucide-link" class="size-3.5" />
            {{ t(`kb.source.${entry.sourceType}`) }}
          </span>
          <span class="inline-flex items-center gap-1 font-mono">
            <UIcon name="i-lucide-clock" class="size-3.5" />
            {{ t('kb.detail.updatedAt', { date: formatDate(entry.updatedAt) }) }}
          </span>
        </div>
      </div>

      <!-- Body — rendered Markdown with wikilink resolution (T-1.9). -->
      <UCard>
        <KbMarkdownPreview
          v-if="entry.bodyMd"
          :body="entry.bodyMd"
        />
        <p v-else class="italic text-muted text-sm">
          {{ t('kb.detail.body.empty') }}
        </p>
      </UCard>

      <!-- Backlinks -->
      <section class="space-y-2">
        <h2 class="text-lg font-semibold text-highlighted">
          {{ t('kb.detail.backlinks.title') }}
        </h2>
        <div v-if="backlinks.length === 0" class="text-sm text-muted">
          {{ t('kb.detail.backlinks.empty') }}
        </div>
        <ul v-else class="space-y-1">
          <li
            v-for="b in backlinks"
            :key="b.id"
          >
            <NuxtLink
              :to="`/app/kb/${encodeURIComponent(b.slug)}`"
              class="inline-flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <UIcon name="i-lucide-corner-up-left" class="size-3.5" />
              {{ b.title }}
            </NuxtLink>
          </li>
        </ul>
      </section>

      <!--
        Linked todos (T-2.8, REQ-TODO-3) — KB side of the Todo↔KB cross-display.
        Always visible (header + "Create todo from this entry" shortcut), so the
        user can attach a todo even when none are linked yet.
      -->
      <section class="space-y-2">
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <h2 class="text-lg font-semibold text-highlighted">
            {{ t('kb.detail.linkedTodos.title') }}
          </h2>
          <div class="flex items-center gap-2 flex-wrap">
            <UButton
              size="xs"
              variant="ghost"
              color="neutral"
              :icon="includeCompletedTodos ? 'i-lucide-eye-off' : 'i-lucide-eye'"
              :label="includeCompletedTodos
                ? t('kb.detail.linkedTodos.hideCompleted')
                : t('kb.detail.linkedTodos.showCompleted')"
              @click="includeCompletedTodos = !includeCompletedTodos"
            />
            <UButton
              size="xs"
              icon="i-lucide-plus"
              :label="t('kb.detail.linkedTodos.createFromEntry')"
              :to="createTodoFromEntryHref"
            />
          </div>
        </div>

        <UAlert
          v-if="linkedTodosError"
          color="error"
          variant="soft"
          icon="i-lucide-alert-circle"
          :title="t('kb.detail.linkedTodos.error')"
          :description="linkedTodosError.message"
        />
        <div v-else-if="linkedTodosLoading" class="space-y-2">
          <USkeleton class="h-12 w-full" />
          <USkeleton class="h-12 w-full" />
        </div>
        <div
          v-else-if="linkedTodos.length === 0"
          class="text-sm text-muted"
        >
          {{ t('kb.detail.linkedTodos.empty') }}
        </div>
        <ul v-else class="space-y-2">
          <li
            v-for="todo in linkedTodos"
            :key="todo.id"
          >
            <UCard :ui="{ body: 'p-3' }">
              <div class="flex items-start gap-3">
                <UCheckbox
                  :model-value="Boolean(todo.completedAt)"
                  :disabled="pendingTodoId === todo.id"
                  :aria-label="todo.completedAt
                    ? t('todo.actions.uncomplete.label')
                    : t('todo.actions.complete.label')"
                  class="mt-0.5"
                  @update:model-value="onToggleTodoComplete(todo)"
                />
                <div class="min-w-0 flex-1 space-y-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <NuxtLink
                      :to="`/app/todos/${encodeURIComponent(todo.id)}`"
                      class="text-sm font-semibold text-highlighted truncate hover:underline"
                      :class="{ 'line-through text-muted': todo.completedAt }"
                    >
                      {{ todo.title }}
                    </NuxtLink>
                    <UBadge
                      :color="priorityColor(todo.priority)"
                      variant="subtle"
                      size="xs"
                    >
                      {{ t(`todo.priority.${todo.priority}`) }}
                    </UBadge>
                  </div>
                  <div
                    v-if="todo.dueAt"
                    class="text-xs font-mono"
                    :class="isOverdue(todo) ? 'text-error font-medium' : 'text-muted'"
                  >
                    <UIcon name="i-lucide-calendar" class="size-3.5 align-text-bottom mr-1" />
                    {{ formatRelative(todo.dueAt) }}
                  </div>
                </div>
              </div>
            </UCard>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
