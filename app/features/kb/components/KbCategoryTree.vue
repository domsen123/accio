<script setup lang="ts">
/**
 * KB category tree (T-1.11, REQ-KB-3).
 *
 * Renders the workspace's `kb_categories` as a collapsible nested tree built
 * client-side via reduce. The selected node drives the entry list filter
 * (the `categoryId` URL param on `/app/kb`); selecting a node uses
 * **server-side descendant expansion** via `?includeDescendantCategories=1`,
 * so picking a parent transparently surfaces entries from the entire subtree.
 *
 * Expand-state persistence: a `Set<categoryId>` of expanded ids is stored in
 * localStorage under `kb:cat-tree:expanded` so the user's open-folder state
 * survives reloads.
 *
 * Inline CRUD scope (T-1.11):
 *   - "+" button at the tree's header → create top-level category modal
 *   - per-row hover dropdown (`UDropdownMenu`) → add child / rename / delete
 *   - rename and delete go through small confirm modals; both are simple
 *     name-field forms, not full editor pages
 *   - bulk operations are NOT in scope (per task hard limits)
 *
 * Read-only fallback: if any of the inline CRUD turns out to misbehave it
 * can be flipped off by removing the dropdown from each node — the tree
 * itself is purely declarative on the input.
 */
import type { KbCategory } from '../types/kb.types'
import {
  useCreateKbCategory,
  useDeleteKbCategory,
  useRenameKbCategory,
} from '../composables/useKbEntryMutations'

interface KbCategoryNode {
  category: KbCategory
  depth: number
  children: KbCategoryNode[]
}

const props = defineProps<{
  categories: KbCategory[]
  selectedId: string
}>()

const emit = defineEmits<{
  (e: 'select', categoryId: string): void
}>()

const { t } = useI18n()
const toast = useToast()

// === Tree construction (reduce flat list → nested) =========================
// Sort siblings alphabetically by name, locale-aware.
const collator = computed(() => new Intl.Collator(undefined, { sensitivity: 'base' }))

const tree = computed<KbCategoryNode[]>(() => {
  const byId = new Map<string, KbCategoryNode>()
  for (const c of props.categories) {
    byId.set(c.id, { category: c, depth: 0, children: [] })
  }

  const roots: KbCategoryNode[] = []
  for (const node of byId.values()) {
    const parentId = node.category.parentId
    if (parentId && byId.has(parentId)) {
      const parent = byId.get(parentId)!
      parent.children.push(node)
    }
    else {
      roots.push(node)
    }
  }

  // Walk to assign depth + sort each level alphabetically (REQ-KB-3 doesn't
  // prescribe an order; alphabetical is the path of least surprise).
  const sortAndDepth = (nodes: KbCategoryNode[], depth: number) => {
    nodes.sort((a, b) => collator.value.compare(a.category.name, b.category.name))
    for (const n of nodes) {
      n.depth = depth
      if (n.children.length > 0)
        sortAndDepth(n.children, depth + 1)
    }
  }
  sortAndDepth(roots, 0)
  return roots
})

// Flat list with depth so the template renders without recursive component
// gymnastics; keeps the markup linear and a11y-friendly. Filter by expanded
// set: a node renders only if every ancestor is expanded.
interface FlatNode {
  category: KbCategory
  depth: number
  hasChildren: boolean
  expanded: boolean
}

const expandedIds = useLocalStorage<string[]>('kb:cat-tree:expanded', [])
const expandedSet = computed(() => new Set(expandedIds.value))

const setExpanded = (id: string, value: boolean) => {
  const next = new Set(expandedIds.value)
  if (value)
    next.add(id)
  else
    next.delete(id)
  expandedIds.value = [...next]
}

const toggleExpanded = (id: string) => {
  setExpanded(id, !expandedSet.value.has(id))
}

const flat = computed<FlatNode[]>(() => {
  const out: FlatNode[] = []
  const walk = (nodes: KbCategoryNode[], visible: boolean) => {
    for (const n of nodes) {
      const expanded = expandedSet.value.has(n.category.id)
      const hasChildren = n.children.length > 0
      if (visible) {
        out.push({
          category: n.category,
          depth: n.depth,
          hasChildren,
          expanded,
        })
      }
      walk(n.children, visible && expanded)
    }
  }
  walk(tree.value, true)
  return out
})

const onSelect = (id: string) => {
  emit('select', id)
}

// Static map so Tailwind keeps these classes; depth ≥ 6 caps to last bucket.
// Indent step ≈ 0.75rem per level; only Tailwind-native spacing tokens used.
const DEPTH_PADDING = [
  'pl-1',
  'pl-4',
  'pl-6',
  'pl-10',
  'pl-12',
  'pl-16',
  'pl-20',
] as const

const depthPaddingClass = (depth: number) =>
  DEPTH_PADDING[Math.min(depth, DEPTH_PADDING.length - 1)]

const onSelectAll = () => {
  emit('select', '')
}

// === Inline CRUD ===========================================================

const { mutateAsync: createCategory, asyncStatus: createStatus } = useCreateKbCategory()
const { mutateAsync: renameCategory, asyncStatus: renameStatus } = useRenameKbCategory()
const { mutateAsync: deleteCategory, asyncStatus: deleteStatus } = useDeleteKbCategory()

const isCreatePending = computed(() => createStatus.value === 'loading')
const isRenamePending = computed(() => renameStatus.value === 'loading')
const isDeletePending = computed(() => deleteStatus.value === 'loading')

// Create modal (handles both "new top-level" and "new child")
const isCreateOpen = ref(false)
const createParentId = ref<string | null>(null)
const createName = ref('')
const createErrorMsg = ref('')

const openCreateRoot = () => {
  createParentId.value = null
  createName.value = ''
  createErrorMsg.value = ''
  isCreateOpen.value = true
}

const openCreateChild = (parent: KbCategory) => {
  createParentId.value = parent.id
  createName.value = ''
  createErrorMsg.value = ''
  isCreateOpen.value = true
  // Auto-expand the parent so the new child shows up after refetch.
  setExpanded(parent.id, true)
}

const submitCreate = async () => {
  const name = createName.value.trim()
  if (!name) {
    createErrorMsg.value = t('kb.categories.errors.nameRequired')
    return
  }
  try {
    await createCategory({ name, parentId: createParentId.value })
    toast.add({
      title: t('kb.categories.toast.created', { name }),
      color: 'success',
    })
    isCreateOpen.value = false
  }
  catch {
    toast.add({
      title: t('kb.categories.toast.createError'),
      color: 'error',
    })
  }
}

// Rename modal
const isRenameOpen = ref(false)
const renameTarget = ref<KbCategory | null>(null)
const renameName = ref('')
const renameErrorMsg = ref('')

const openRename = (cat: KbCategory) => {
  renameTarget.value = cat
  renameName.value = cat.name
  renameErrorMsg.value = ''
  isRenameOpen.value = true
}

const submitRename = async () => {
  if (!renameTarget.value)
    return
  const name = renameName.value.trim()
  if (!name) {
    renameErrorMsg.value = t('kb.categories.errors.nameRequired')
    return
  }
  if (name === renameTarget.value.name) {
    isRenameOpen.value = false
    return
  }
  try {
    await renameCategory({ id: renameTarget.value.id, name })
    toast.add({
      title: t('kb.categories.toast.renamed'),
      color: 'success',
    })
    isRenameOpen.value = false
  }
  catch {
    toast.add({
      title: t('kb.categories.toast.renameError'),
      color: 'error',
    })
  }
}

// Delete confirm
const isDeleteOpen = ref(false)
const deleteTarget = ref<KbCategory | null>(null)

const openDelete = (cat: KbCategory) => {
  deleteTarget.value = cat
  isDeleteOpen.value = true
}

const submitDelete = async () => {
  if (!deleteTarget.value)
    return
  const target = deleteTarget.value
  try {
    await deleteCategory(target.id)
    // If we just deleted the active filter, clear it.
    if (props.selectedId === target.id)
      emit('select', '')
    toast.add({
      title: t('kb.categories.toast.deleted'),
      color: 'success',
    })
    isDeleteOpen.value = false
  }
  catch {
    toast.add({
      title: t('kb.categories.toast.deleteError'),
      color: 'error',
    })
  }
}

// Per-row dropdown items (UDropdownMenu format).
const itemsFor = (cat: KbCategory) => [
  [
    {
      label: t('kb.categories.menu.addChild'),
      icon: 'i-lucide-folder-plus',
      onSelect: () => openCreateChild(cat),
    },
    {
      label: t('kb.categories.menu.rename'),
      icon: 'i-lucide-pencil',
      onSelect: () => openRename(cat),
    },
  ],
  [
    {
      label: t('kb.categories.menu.delete'),
      icon: 'i-lucide-trash-2',
      color: 'error' as const,
      onSelect: () => openDelete(cat),
    },
  ],
]
</script>

<template>
  <aside class="space-y-3" :aria-label="t('kb.categories.title')">
    <!-- Header: title + create top-level -->
    <div class="flex items-center justify-between px-2 pt-1">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-muted">
        {{ t('kb.categories.title') }}
      </h2>
      <UButton
        icon="i-lucide-plus"
        size="xs"
        variant="ghost"
        color="neutral"
        :aria-label="t('kb.categories.menu.addRoot')"
        @click="openCreateRoot"
      />
    </div>

    <!-- "All" pseudo-row clears the filter -->
    <UButton
      :color="selectedId === '' ? 'primary' : 'neutral'"
      :variant="selectedId === '' ? 'subtle' : 'ghost'"
      size="sm"
      icon="i-lucide-inbox"
      :label="t('kb.categories.all')"
      block
      :ui="{ base: 'justify-start', label: 'truncate' }"
      @click="onSelectAll"
    />

    <!-- Tree -->
    <ul v-if="flat.length > 0" class="space-y-0.5" role="tree">
      <li
        v-for="node in flat"
        :key="node.category.id"
        role="treeitem"
        :aria-expanded="node.hasChildren ? node.expanded : undefined"
        :aria-selected="selectedId === node.category.id"
        class="group/node"
      >
        <div
          class="flex items-center gap-1 pr-1 rounded-md transition-colors"
          :class="[
            selectedId === node.category.id
              ? 'bg-primary/10 text-primary'
              : 'text-default hover:bg-accented',
            depthPaddingClass(node.depth),
          ]"
        >
          <!-- Chevron / spacer -->
          <UButton
            v-if="node.hasChildren"
            color="neutral"
            variant="ghost"
            size="xs"
            square
            :icon="node.expanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
            :aria-label="
              node.expanded
                ? t('kb.categories.collapse')
                : t('kb.categories.expand')
            "
            @click.stop="toggleExpanded(node.category.id)"
          />
          <span v-else class="size-5 shrink-0" aria-hidden="true" />

          <!-- Label (selectable) -->
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            :label="node.category.name"
            icon="i-lucide-folder"
            :ui="{
              base: 'flex-1 min-w-0 justify-start',
              label: ['truncate', selectedId === node.category.id ? 'font-medium' : ''],
            }"
            @click="onSelect(node.category.id)"
          />

          <!-- Actions menu (visible on hover/focus-within) -->
          <UDropdownMenu :items="itemsFor(node.category)" :content="{ align: 'end' }">
            <UButton
              icon="i-lucide-ellipsis-vertical"
              size="xs"
              variant="ghost"
              color="neutral"
              class="opacity-0 group-hover/node:opacity-100 focus:opacity-100"
              :aria-label="t('kb.categories.menu.label')"
              @click.stop
            />
          </UDropdownMenu>
        </div>
      </li>
    </ul>
    <div v-else class="flex flex-col items-center justify-center gap-3 px-2 py-8 text-center">
      <div class="flex items-center justify-center size-14 rounded-full bg-accented">
        <UIcon name="i-lucide-folder-tree" class="size-7 text-muted" />
      </div>
      <p class="text-sm text-muted">
        {{ t('kb.categories.empty') }}
      </p>
    </div>

    <!-- Create modal -->
    <UModal v-model:open="isCreateOpen">
      <template #content>
        <UCard>
          <template #header>
            <h3 class="text-base font-semibold text-highlighted">
              {{ createParentId ? t('kb.categories.create.childTitle') : t('kb.categories.create.rootTitle') }}
            </h3>
          </template>

          <form class="space-y-3" @submit.prevent="submitCreate">
            <UFormField :label="t('kb.categories.fields.name')">
              <UInput
                v-model="createName"
                autofocus
                :placeholder="t('kb.categories.fields.namePlaceholder')"
              />
            </UFormField>
            <p v-if="createErrorMsg" class="text-sm text-error">
              {{ createErrorMsg }}
            </p>

            <div class="flex items-center justify-end gap-3 pt-2">
              <UButton
                variant="ghost"
                color="neutral"
                :disabled="isCreatePending"
                @click="isCreateOpen = false"
              >
                {{ t('kb.categories.actions.cancel') }}
              </UButton>
              <UButton
                type="submit"
                :loading="isCreatePending"
              >
                {{ t('kb.categories.actions.create') }}
              </UButton>
            </div>
          </form>
        </UCard>
      </template>
    </UModal>

    <!-- Rename modal -->
    <UModal v-model:open="isRenameOpen">
      <template #content>
        <UCard>
          <template #header>
            <h3 class="text-base font-semibold text-highlighted">
              {{ t('kb.categories.rename.title') }}
            </h3>
          </template>

          <form class="space-y-3" @submit.prevent="submitRename">
            <UFormField :label="t('kb.categories.fields.name')">
              <UInput v-model="renameName" autofocus />
            </UFormField>
            <p v-if="renameErrorMsg" class="text-sm text-error">
              {{ renameErrorMsg }}
            </p>

            <div class="flex items-center justify-end gap-3 pt-2">
              <UButton
                variant="ghost"
                color="neutral"
                :disabled="isRenamePending"
                @click="isRenameOpen = false"
              >
                {{ t('kb.categories.actions.cancel') }}
              </UButton>
              <UButton
                type="submit"
                :loading="isRenamePending"
              >
                {{ t('kb.categories.actions.save') }}
              </UButton>
            </div>
          </form>
        </UCard>
      </template>
    </UModal>

    <!-- Delete confirm modal -->
    <UModal v-model:open="isDeleteOpen">
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center gap-3">
              <div class="flex items-center justify-center size-10 rounded-lg bg-error/10">
                <UIcon name="i-lucide-alert-triangle" class="size-5 text-error" />
              </div>
              <div>
                <h3 class="text-base font-semibold text-highlighted">
                  {{ t('kb.categories.delete.title') }}
                </h3>
                <p class="text-sm text-muted">
                  {{ deleteTarget?.name }}
                </p>
              </div>
            </div>
          </template>

          <p class="text-sm text-default">
            {{ t('kb.categories.delete.body') }}
          </p>

          <div class="flex items-center justify-end gap-3 pt-4">
            <UButton
              variant="ghost"
              color="neutral"
              :disabled="isDeletePending"
              @click="isDeleteOpen = false"
            >
              {{ t('kb.categories.actions.cancel') }}
            </UButton>
            <UButton
              color="error"
              :loading="isDeletePending"
              @click="submitDelete"
            >
              {{ t('kb.categories.actions.delete') }}
            </UButton>
          </div>
        </UCard>
      </template>
    </UModal>
  </aside>
</template>
