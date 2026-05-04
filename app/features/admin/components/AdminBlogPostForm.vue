<script setup lang="ts">
import type { EditorCustomHandlers, EditorToolbarItem, FormSubmitEvent } from '@nuxt/ui'
import type { Editor } from '@tiptap/vue-3'
import type { AdminBlogPost, AdminMediaFile } from '../types/admin.types'
import { CalendarDateTime } from '@internationalized/date'
import * as z from 'zod'
import { ImageUpload } from './EditorImageUploadExtension'

const props = defineProps<{
  post?: AdminBlogPost
}>()

const emit = defineEmits<{
  success: []
  cancel: []
}>()

// Media picker state
const editorRef = ref<Editor | null>(null)
const isMediaPickerOpen = ref(false)

const onMediaSelected = (file: AdminMediaFile) => {
  if (!editorRef.value)
    return
  editorRef.value
    .chain()
    .focus()
    .setImage({
      src: file.url,
      alt: file.metadata?.alt || file.originalName,
      title: file.metadata?.title || undefined,
    })
    .run()
}

const customHandlers = {
  imageUpload: {
    canExecute: (editor: Editor) => editor.can().setImage({ src: '' }),
    execute: (editor: Editor) => {
      editorRef.value = editor
      isMediaPickerOpen.value = true
    },
    isActive: (editor: Editor) => editor.isActive('image'),
    isDisabled: undefined,
  },
} satisfies EditorCustomHandlers

const toolbarItems: EditorToolbarItem<typeof customHandlers>[][] = [
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
    { kind: 'imageUpload', icon: 'i-lucide-image', tooltip: { text: 'Add image' } },
  ],
]

const TITLE_MAX_LENGTH = 200
const SLUG_MAX_LENGTH = 200
const TEASER_MAX_LENGTH = 500

const isEditMode = computed(() => !!props.post)
const slugManuallyEdited = ref(false)

// Scheduled publish date
const isoToCalendarDateTime = (iso: string): CalendarDateTime => {
  const d = new Date(iso)
  return new CalendarDateTime(d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes())
}

const calendarDateTimeToIso = (cdt: CalendarDateTime): string =>
  new Date(cdt.year, cdt.month - 1, cdt.day, cdt.hour, cdt.minute).toISOString()

const scheduledDate = shallowRef<CalendarDateTime | undefined>(
  props.post?.publishedAt ? isoToCalendarDateTime(props.post.publishedAt) : undefined,
)

const schema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(TITLE_MAX_LENGTH),
  slug: z.string().trim().min(1, 'Slug is required').max(SLUG_MAX_LENGTH).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens only'),
  teaser: z.string().trim().max(TEASER_MAX_LENGTH).default(''),
  content: z.string().trim().min(1, 'Content is required'),
  published: z.boolean().default(false),
  categoryId: z.string().optional(),
  tagIds: z.array(z.string()).default([]),
})

type Schema = z.output<typeof schema>

const state = reactive<Schema>({
  title: props.post?.title ?? '',
  slug: props.post?.slug ?? '',
  teaser: props.post?.teaser ?? '',
  content: props.post?.content ?? '',
  published: props.post?.published ?? false,
  categoryId: props.post?.categoryId ?? undefined,
  tagIds: props.post?.tags.map(t => t.id) ?? [],
})

const isScheduled = computed(() =>
  state.published && scheduledDate.value && new Date(calendarDateTimeToIso(scheduledDate.value)) > new Date(),
)

const publishStatusLabel = computed(() => {
  if (!state.published)
    return 'Draft'
  if (isScheduled.value)
    return 'Scheduled'
  return 'Published'
})

const generateSlug = (title: string): string =>
  title.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, SLUG_MAX_LENGTH)

watch(() => state.title, (newTitle) => {
  if (!isEditMode.value && !slugManuallyEdited.value) {
    state.slug = generateSlug(newTitle)
  }
})

const onSlugInput = () => {
  slugManuallyEdited.value = true
}

const resetSlugAutoGeneration = () => {
  slugManuallyEdited.value = false
  state.slug = generateSlug(state.title)
}

// Fetch all categories and tags for selection
const { categories: allCategories } = useAdminBlogCategories(() => ({ limit: 200 }))
const { tags: allTags } = useAdminBlogTags(() => ({ limit: 200 }))

const categoryOptions = computed(() =>
  allCategories.value.map(cat => ({
    label: cat.name,
    value: cat.id,
  })),
)

const tagOptions = computed(() =>
  allTags.value.map(tag => ({
    label: tag.name,
    value: tag.id,
  })),
)

const { mutateAsync: createBlogCategory } = useCreateBlogCategory()
const { mutateAsync: createBlogTag } = useCreateBlogTag()
const toast = useToast()

const onCreateCategory = async (name: string) => {
  try {
    const { category } = await createBlogCategory({ name, slug: generateSlug(name) })
    state.categoryId = category.id
    toast.add({ title: `Category "${name}" created`, color: 'success' })
  }
  catch {
    toast.add({ title: `Failed to create category "${name}"`, color: 'error' })
  }
}

const onCreate = async (name: string) => {
  try {
    const { tag } = await createBlogTag({ name, slug: generateSlug(name) })
    state.tagIds.push(tag.id)
    toast.add({ title: `Tag "${name}" created`, color: 'success' })
  }
  catch {
    toast.add({ title: `Failed to create tag "${name}"`, color: 'error' })
  }
}

const { mutateAsync: createPost, asyncStatus: createStatus, error: createError } = useCreateBlogPost()
const { mutateAsync: updatePost, asyncStatus: updateStatus, error: updateError } = useUpdateBlogPost()

const isLoading = computed(() =>
  createStatus.value === 'loading' || updateStatus.value === 'loading',
)

const apiError = computed(() => {
  const err = (createError.value || updateError.value) as {
    statusCode?: number
    data?: { statusMessage?: string }
    message?: string
  } | null
  if (!err)
    return null
  if (err.statusCode === 409)
    return 'A post with this slug already exists. Please choose a different slug.'
  return err.data?.statusMessage || err.message || 'An unexpected error occurred. Please try again.'
})

const onSubmit = async (event: FormSubmitEvent<Schema>) => {
  const publishedAt = state.published && scheduledDate.value
    ? calendarDateTimeToIso(scheduledDate.value)
    : null

  const submitData = { ...event.data, publishedAt, categoryId: event.data.categoryId ?? null }

  try {
    if (isEditMode.value) {
      await updatePost({ id: props.post!.id, data: submitData })
    }
    else {
      await createPost(submitData)
    }
    emit('success')
  }
  catch {
    // Error captured in refs
  }
}
</script>

<template>
  <UForm
    id="blog-post-form"
    :schema="schema"
    :state="state"
    class="space-y-4"
    @submit="onSubmit"
  >
    <!-- Error Alert -->
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
        class="animate-shake"
      />
    </Transition>

    <!-- Two-column layout: Editor + Sidebar -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <!-- Main Editor -->
      <div class="lg:col-span-9 space-y-4">
        <!-- Title -->
        <UFormField name="title">
          <UInput
            v-model="state.title"
            placeholder="Enter title here"
            size="xl"
            :maxlength="TITLE_MAX_LENGTH"
          />
        </UFormField>

        <!-- Permalink -->
        <UFormField name="slug">
          <div class="flex items-center gap-2 text-sm">
            <span class="text-muted shrink-0">Permalink:</span>
            <UInput
              v-model="state.slug"
              placeholder="my-awesome-blog-post"
              size="xs"
              variant="subtle"
              :maxlength="SLUG_MAX_LENGTH"
              class="flex-1"
              @input="onSlugInput"
            />
            <button
              v-if="!isEditMode && slugManuallyEdited"
              type="button"
              class="text-primary hover:text-primary/80 transition-colors text-xs font-medium inline-flex items-center gap-1 shrink-0"
              @click="resetSlugAutoGeneration"
            >
              <UIcon name="i-lucide-refresh-cw" class="size-3" />
              Auto
            </button>
          </div>
        </UFormField>

        <!-- Content -->
        <UFormField name="content">
          <UEditor
            v-slot="{ editor }"
            v-model="state.content"
            :extensions="[ImageUpload]"
            :handlers="customHandlers"
            content-type="markdown"
            placeholder="Write your post content here..."
            class="w-full min-h-120 flex flex-col gap-4 rounded-lg bg-elevated/50 ring ring-default p-4"
          >
            <UEditorToolbar :editor="editor" :items="toolbarItems" class="pb-4 border-b border-default" />
          </UEditor>
        </UFormField>
      </div>

      <!-- Sidebar Meta Boxes -->
      <div class="lg:col-span-3 space-y-4 lg:sticky lg:top-4 lg:self-start">
        <!-- Publish Box -->
        <UPageCard title="Publish" variant="subtle">
          <div class="space-y-4">
            <UFormField name="published">
              <div class="flex items-center justify-between">
                <span class="text-sm text-muted">
                  Status: <span class="font-medium text-default">{{ publishStatusLabel }}</span>
                </span>
                <USwitch v-model="state.published" size="sm" />
              </div>
            </UFormField>

            <UFormField label="Publish date" class="grid grid-cols-2">
              <div>
                <UInputDate
                  v-model="scheduledDate"
                  granularity="minute"
                  :hide-time-zone="true"
                  size="sm"
                />
                <span class="text-xs text-muted">Leave empty for immediate</span>
              </div>
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
                Cancel
              </UButton>
              <UButton
                form="blog-post-form"
                type="submit"
                size="sm"
                :loading="isLoading"
              >
                {{ isEditMode ? 'Update' : 'Publish' }}
              </UButton>
            </div>
          </div>
        </UPageCard>

        <!-- Category Box -->
        <UPageCard title="Category" variant="subtle">
          <UFormField name="categoryId">
            <USelectMenu
              v-model="state.categoryId"
              :items="categoryOptions"
              value-key="value"
              placeholder="Select category..."
              create-item
              @create="onCreateCategory"
            />
          </UFormField>
        </UPageCard>

        <!-- Tags Box -->
        <UPageCard title="Tags" variant="subtle">
          <UFormField name="tagIds">
            <USelectMenu
              v-model="state.tagIds"
              :items="tagOptions"
              value-key="value"
              multiple
              placeholder="Select tags..."
              create-item
              @create="onCreate"
            />
          </UFormField>
        </UPageCard>

        <!-- Excerpt Box -->
        <UPageCard title="Excerpt" variant="subtle">
          <UFormField name="teaser">
            <UTextarea
              v-model="state.teaser"
              placeholder="Write a short summary..."
              :maxlength="TEASER_MAX_LENGTH"
              :rows="3"
            />
          </UFormField>
        </UPageCard>
      </div>
    </div>

    <!-- Media Picker Modal -->
    <AdminMediaPickerModal
      v-model:open="isMediaPickerOpen"
      @select="onMediaSelected"
    />
  </UForm>
</template>

<style scoped>
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-2px); }
  20%, 40%, 60%, 80% { transform: translateX(2px); }
}

.animate-shake {
  animation: shake 0.5s ease-in-out;
}
</style>
