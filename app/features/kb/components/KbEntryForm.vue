<script setup lang="ts">
/**
 * KB entry create/edit form (T-1.9).
 *
 * Two layout columns:
 *   - left: title field + Markdown editor + preview (split panes).
 *   - right: status selector, category picker, tag picker.
 *
 * Editor stack: a plain `<textarea>` with monospace font on the left, our
 * `KbMarkdownPreview` on the right. Rationale (vs Nuxt UI's TipTap-backed
 * `UEditor`): TipTap in `content-type="markdown"` mode does **not** round-
 * trip Markdown faithfully — its serialiser drops less common syntax
 * (footnotes, raw HTML, advanced wikilink-style tokens) and rewrites
 * whitespace in code blocks. For a wiki-style editor where the body is
 * authoritative Markdown and wikilinks are first-class, a textarea + live
 * preview is simpler and lossless. See specs/tasks.md T-1.9 deviations.
 *
 * Tag picker emits names (not ids); the API's create+update endpoints
 * accept `tagNames` with server-side findOrCreate so user-typed values
 * materialise on save without an extra call. Category creation, by
 * contrast, requires an explicit `POST /api/kb/categories` first because
 * the entry endpoint only accepts an existing `categoryId`.
 *
 * Submit fires create or update via the matching mutation composable. On
 * success the parent emits `success` with the resulting entry so the page
 * can navigate.
 */
import type { FormSubmitEvent } from '@nuxt/ui'
import type { KbEntry, KbEntryStatus } from '../types/kb.types'
import { refDebounced } from '@vueuse/core'
import * as z from 'zod'
import {
  useCreateKbEntry,
  useUpdateKbEntry,
} from '../composables/useKbEntryMutations'
import KbCategoryPicker from './KbCategoryPicker.vue'
import KbMarkdownPreview from './KbMarkdownPreview.vue'
import KbTagPicker from './KbTagPicker.vue'

const props = defineProps<{
  entry?: KbEntry | null
}>()

const emit = defineEmits<{
  success: [entry: KbEntry]
  cancel: []
}>()

const { t } = useI18n()
const toast = useToast()

const TITLE_MAX = 200
const BODY_MAX = 200_000
const STATUSES: readonly KbEntryStatus[] = ['inbox', 'draft', 'verified', 'archived']

const isEditMode = computed(() => Boolean(props.entry))

const schema = z.object({
  title: z.string().trim().min(1, t('kb.form.errors.titleRequired')).max(TITLE_MAX),
  body: z.string().max(BODY_MAX),
  categoryId: z.string().nullable(),
  tagNames: z.array(z.string().trim().min(1).max(50)),
  status: z.enum(STATUSES as unknown as [KbEntryStatus, ...KbEntryStatus[]]),
})

type Schema = z.output<typeof schema>

const state = reactive<Schema>({
  title: props.entry?.title ?? '',
  body: props.entry?.bodyMd ?? '',
  categoryId: props.entry?.categoryId ?? null,
  tagNames: props.entry?.tags?.map(t => t.name) ?? [],
  status: props.entry?.status ?? 'draft',
})

// Debounce the body for the preview pane so each keystroke isn't a re-render
// + bulk-resolve hit.
const debouncedBody = refDebounced(toRef(state, 'body'), 250)

const statusOptions = computed(() =>
  STATUSES.map(value => ({
    value,
    label: t(`kb.status.${value}`),
  })),
)

const { mutateAsync: createEntry, asyncStatus: createStatus, error: createError } = useCreateKbEntry()
const { mutateAsync: updateEntry, asyncStatus: updateStatus, error: updateError } = useUpdateKbEntry()

const isLoading = computed(
  () => createStatus.value === 'loading' || updateStatus.value === 'loading',
)

const apiError = computed(() => {
  const err = (createError.value || updateError.value) as
    | { statusCode?: number, data?: { statusMessage?: string }, message?: string }
    | null
  if (!err)
    return null
  if (err.statusCode === 409)
    return t('kb.form.errors.conflict')
  return err.data?.statusMessage || err.message || t('kb.form.errors.generic')
})

const onSubmit = async (event: FormSubmitEvent<Schema>) => {
  try {
    const payload = {
      title: event.data.title,
      body: event.data.body,
      categoryId: event.data.categoryId ?? null,
      tagNames: event.data.tagNames,
      status: event.data.status as KbEntryStatus,
    }
    let result: { entry: KbEntry }
    if (isEditMode.value && props.entry) {
      result = await updateEntry({ id: props.entry.id, data: payload })
      toast.add({ title: t('kb.form.toast.updated'), color: 'success' })
    }
    else {
      result = await createEntry(payload)
      toast.add({ title: t('kb.form.toast.created'), color: 'success' })
    }
    emit('success', result.entry)
  }
  catch {
    // The error refs already capture the failure — toast it for visibility.
    toast.add({ title: t('kb.form.toast.error'), color: 'error' })
  }
}
</script>

<template>
  <UForm
    id="kb-entry-form"
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

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <!-- Editor column -->
      <div class="lg:col-span-9 space-y-4">
        <UFormField name="title">
          <UInput
            v-model="state.title"
            :placeholder="t('kb.form.title.placeholder')"
            size="xl"
            :maxlength="TITLE_MAX"
          />
        </UFormField>

        <!-- Split editor + preview -->
        <UFormField name="body">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 min-h-[24rem]">
            <div class="flex flex-col">
              <label class="text-xs font-medium text-muted mb-1">
                {{ t('kb.editor.markdown.label') }}
              </label>
              <UTextarea
                v-model="state.body"
                :placeholder="t('kb.editor.markdown.placeholder')"
                :maxlength="BODY_MAX"
                :rows="20"
                class="font-mono"
                resize
                :ui="{
                  base: 'font-mono text-sm leading-relaxed',
                }"
              />
            </div>
            <div class="flex flex-col">
              <label class="text-xs font-medium text-muted mb-1">
                {{ t('kb.editor.preview.label') }}
              </label>
              <div
                class="rounded-md ring ring-default p-3 overflow-auto bg-elevated min-h-[24rem] max-h-[40rem]"
              >
                <KbMarkdownPreview :body="debouncedBody" />
              </div>
            </div>
          </div>
          <p class="text-xs text-muted mt-1">
            {{ t('kb.editor.help') }}
          </p>
        </UFormField>
      </div>

      <!-- Sidebar -->
      <div class="lg:col-span-3 space-y-4 lg:sticky lg:top-4 lg:self-start">
        <UPageCard :title="t('kb.form.publish.title')" variant="subtle">
          <div class="space-y-3">
            <UFormField name="status" :label="t('kb.form.status.label')">
              <USelectMenu
                v-model="state.status"
                :items="statusOptions"
                value-key="value"
                label-key="label"
                class="w-full"
              />
            </UFormField>
            <USeparator />
            <div class="flex gap-2 justify-end">
              <UButton
                variant="ghost"
                color="neutral"
                size="sm"
                :disabled="isLoading"
                @click="emit('cancel')"
              >
                {{ t('kb.form.actions.cancel') }}
              </UButton>
              <UButton
                form="kb-entry-form"
                type="submit"
                size="sm"
                :loading="isLoading"
              >
                {{ isEditMode ? t('kb.form.actions.update') : t('kb.form.actions.create') }}
              </UButton>
            </div>
          </div>
        </UPageCard>

        <UPageCard :title="t('kb.form.category.title')" variant="subtle">
          <UFormField name="categoryId">
            <KbCategoryPicker v-model="state.categoryId" />
          </UFormField>
        </UPageCard>

        <UPageCard :title="t('kb.form.tags.title')" variant="subtle">
          <UFormField name="tagNames">
            <KbTagPicker v-model="state.tagNames" />
          </UFormField>
        </UPageCard>
      </div>
    </div>
  </UForm>
</template>
