<script setup lang="ts">
/**
 * Recursive renderer for one folder node in the tree (T-V-25). The
 * parent component (VaultFolderTree) owns all mutation state and just
 * forwards events down — keeps this component free of mutation
 * composables so it can recurse without triggering N×N hooks.
 */
import type { VaultFolderNode } from '../utils/folderTree'

const props = defineProps<{
  node: VaultFolderNode
  selectedId: string | null
  expanded: Set<string>
  renamingId: string | null
  renameValue: string
  newFolderParent: string | null | undefined
  newFolderName: string
  deleteOpen: string | null
  deleteStrategy: 'move_to_parent' | 'delete_recursive'
}>()

const emit = defineEmits<{
  'select': [folderId: string]
  'toggle': [folderId: string]
  'beginRename': [folderId: string, currentName: string]
  'commitRename': []
  'cancelRename': []
  'update:renameValue': [value: string]
  'beginCreate': [parentId: string]
  'commitCreate': []
  'cancelCreate': []
  'update:newFolderName': [value: string]
  'beginDelete': [folderId: string]
  'commitDelete': []
  'update:deleteStrategy': [value: 'move_to_parent' | 'delete_recursive']
  'cancelDelete': []
}>()

const { t } = useI18n()

const isSelected = computed(() => props.selectedId === props.node.folder.id)
const isExpanded = computed(() => props.expanded.has(props.node.folder.id))
const hasChildren = computed(() => props.node.children.length > 0)
const isRenaming = computed(() => props.renamingId === props.node.folder.id)
const isCreatingChild = computed(() => props.newFolderParent === props.node.folder.id)
const isDeleting = computed(() => props.deleteOpen === props.node.folder.id)

const indent = computed(() => `${props.node.depth * 12 + 4}px`)

const actions = computed(() => [
  [
    {
      label: t('vault.folders.rename'),
      icon: 'i-lucide-pencil',
      onSelect: () => emit('beginRename', props.node.folder.id, props.node.folder.name),
    },
    {
      label: t('vault.folders.newSubfolder'),
      icon: 'i-lucide-folder-plus',
      onSelect: () => emit('beginCreate', props.node.folder.id),
    },
  ],
  [
    {
      label: t('vault.folders.delete'),
      icon: 'i-lucide-trash-2',
      color: 'error' as const,
      onSelect: () => emit('beginDelete', props.node.folder.id),
    },
  ],
])

const renameValueModel = computed({
  get: () => props.renameValue,
  set: (v: string) => emit('update:renameValue', v),
})

const newFolderNameModel = computed({
  get: () => props.newFolderName,
  set: (v: string) => emit('update:newFolderName', v),
})

const deleteStrategyModel = computed({
  get: () => props.deleteStrategy,
  set: (v: 'move_to_parent' | 'delete_recursive') => emit('update:deleteStrategy', v),
})
</script>

<template>
  <div>
    <div
      class="group flex items-center gap-1 rounded py-1 pr-1 text-left hover:bg-muted"
      :class="{ 'bg-muted font-medium': isSelected }"
      :style="{ paddingLeft: indent }"
    >
      <button
        v-if="hasChildren"
        type="button"
        class="size-4 flex items-center justify-center text-muted"
        @click="emit('toggle', node.folder.id)"
      >
        <UIcon
          :name="isExpanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
          class="size-3"
        />
      </button>
      <span v-else class="size-4" />
      <UIcon name="i-lucide-folder" class="size-4 text-muted" />
      <template v-if="isRenaming">
        <UInput
          v-model="renameValueModel"
          size="xs"
          autofocus
          class="flex-1"
          @keydown.enter.prevent="emit('commitRename')"
          @keydown.esc="emit('cancelRename')"
        />
        <UButton
          size="xs"
          icon="i-lucide-check"
          color="primary"
          variant="solid"
          @click="emit('commitRename')"
        />
        <UButton
          size="xs"
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          @click="emit('cancelRename')"
        />
      </template>
      <template v-else>
        <button
          type="button"
          class="flex-1 truncate text-left"
          @click="emit('select', node.folder.id)"
        >
          {{ node.folder.name }}
        </button>
        <UDropdownMenu :items="actions">
          <UButton
            icon="i-lucide-more-vertical"
            size="xs"
            color="neutral"
            variant="ghost"
            class="opacity-0 group-hover:opacity-100"
            :aria-label="t('vault.folders.delete')"
          />
        </UDropdownMenu>
      </template>
    </div>

    <div
      v-if="isCreatingChild"
      class="flex items-center gap-1 py-1"
      :style="{ paddingLeft: `${(node.depth + 1) * 12 + 4}px` }"
    >
      <UIcon name="i-lucide-folder-plus" class="size-4 text-muted" />
      <UInput
        v-model="newFolderNameModel"
        size="xs"
        :placeholder="t('vault.folders.newFolderName')"
        class="flex-1"
        autofocus
        @keydown.enter.prevent="emit('commitCreate')"
        @keydown.esc="emit('cancelCreate')"
      />
      <UButton
        size="xs"
        icon="i-lucide-check"
        color="primary"
        variant="solid"
        @click="emit('commitCreate')"
      />
      <UButton
        size="xs"
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        @click="emit('cancelCreate')"
      />
    </div>

    <div v-if="isExpanded">
      <VaultFolderTreeNode
        v-for="child in node.children"
        :key="child.folder.id"
        :node="child"
        :selected-id="props.selectedId"
        :expanded="props.expanded"
        :renaming-id="props.renamingId"
        :rename-value="props.renameValue"
        :new-folder-parent="props.newFolderParent"
        :new-folder-name="props.newFolderName"
        :delete-open="props.deleteOpen"
        :delete-strategy="props.deleteStrategy"
        @select="(id: string) => emit('select', id)"
        @toggle="(id: string) => emit('toggle', id)"
        @begin-rename="(id: string, name: string) => emit('beginRename', id, name)"
        @commit-rename="emit('commitRename')"
        @cancel-rename="emit('cancelRename')"
        @update:rename-value="(v: string) => emit('update:renameValue', v)"
        @begin-create="(id: string) => emit('beginCreate', id)"
        @commit-create="emit('commitCreate')"
        @cancel-create="emit('cancelCreate')"
        @update:new-folder-name="(v: string) => emit('update:newFolderName', v)"
        @begin-delete="(id: string) => emit('beginDelete', id)"
        @commit-delete="emit('commitDelete')"
        @update:delete-strategy="(v: 'move_to_parent' | 'delete_recursive') => emit('update:deleteStrategy', v)"
        @cancel-delete="emit('cancelDelete')"
      />
    </div>

    <UModal
      :open="isDeleting"
      :title="t('vault.folders.deleteStrategyTitle')"
      @update:open="(v: boolean) => v ? null : emit('cancelDelete')"
    >
      <template #body>
        <div class="light space-y-3">
          <p class="text-sm text-default">
            {{ t('vault.folders.deleteStrategyDescription') }}
          </p>
          <URadioGroup
            v-model="deleteStrategyModel"
            :items="[
              { label: t('vault.folders.moveToParent'), value: 'move_to_parent' },
              { label: t('vault.folders.deleteRecursive'), value: 'delete_recursive' },
            ]"
          />
          <div class="flex justify-end gap-2 pt-2">
            <UButton
              color="neutral"
              variant="ghost"
              size="sm"
              :label="t('vault.folders.cancel')"
              @click="emit('cancelDelete')"
            />
            <UButton
              color="error"
              size="sm"
              :label="t('vault.folders.submitDelete')"
              @click="emit('commitDelete')"
            />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
