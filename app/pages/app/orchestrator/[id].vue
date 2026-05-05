<script setup lang="ts">
/**
 * Orchestrator chat view (T-3.13 + T-3.14 + T-3.15) — `/app/orchestrator/[id]`.
 *
 * Renders the conversation header (editable title, mode toggle, model
 * picker), the message history with inline tool-call / tool-result / pending
 * confirmation cards (T-3.14), and a streaming composer (T-3.15) wired to
 * `useChatStream` for token-by-token rendering.
 *
 * Streaming flow:
 *   - On send, we POST to `/api/orchestrator/conversations/[id]/messages`,
 *     append a "live" trailing block built from `text-delta` / `tool-call`
 *     / `tool-result` events, and refetch on `message-complete` so the
 *     persisted DB row replaces the live state.
 *   - On `confirmation_required`, populate `pendingConfirmation`. The card
 *     emits `confirmed` / `cancelled` carrying the `actionId`; the page
 *     opens a new stream against `/confirm` or `/cancel` and consumes the
 *     resumed turn.
 *   - On `error`, show a translated alert and re-enable the composer.
 *   - Aborting the stream cancels the request; `retry()` re-runs the most
 *     recent stream args (no auto-reconnect — see `useChatStream` docs).
 *
 * Permission gating:
 *   - `orchestrator:use` is required to load the page (server enforces too).
 *   - Mode flip to `read_write` requires `orchestrator:write`; the toggle is
 *     disabled with a tooltip otherwise.
 *
 * Refs: REQ-ORCH-1, REQ-ORCH-3, REQ-ORCH-4, REQ-AI-4.
 */
import type {
  ConversationMessage,
  ConversationMode,
  MessageContentBlock,
  MessageTextBlock,
  MessageToolCallBlock,
  MessageToolResultBlock,
} from '~/features/orchestrator/types/conversation.types'
import type { ChatEvent } from '~/features/orchestrator/types/stream.types'
import { orchestratorStreamPaths } from '~/features/orchestrator/api/conversations'
import ConfirmationCard from '~/features/orchestrator/components/ConfirmationCard.vue'
import ToolCallCard from '~/features/orchestrator/components/ToolCallCard.vue'
import ToolResultCard from '~/features/orchestrator/components/ToolResultCard.vue'
import { useChatStream } from '~/features/orchestrator/composables/useChatStream'
import {
  useConversation,
  useUpdateConversation,
} from '~/features/orchestrator/composables/useConversations'
import { useEligibleModels } from '~/features/orchestrator/composables/useEligibleModels'
import { usePermissions } from '~/features/permissions'

interface PendingConfirmation {
  toolCallId: string
  actionId: string
  toolName: string
  input: unknown
  affectedCount: number
  reason: 'class' | 'bulk'
}

interface LiveToolCall {
  toolCallId: string
  toolName: string
  input: unknown
}

interface LiveToolResult {
  toolCallId: string
  actionId: string
  toolName?: string
  result: unknown
}

interface StreamErrorState {
  code: string
  message: string
}

definePageMeta({
  layout: 'app',
  auth: true,
})

const { t, locale } = useI18n()
const route = useRoute()
const toast = useToast()

const conversationId = computed(() => String(route.params.id))

useSeoMeta({
  title: () => t('orchestrator.chat.title'),
})

// ─── Permission gating ─────────────────────────────────────────────────────
const permissions = usePermissions()
const canUse = computed(() => {
  if (permissions.isGlobalAdmin.value)
    return true
  const orgPerms = permissions.data.value?.organisations ?? {}
  return Object.values(orgPerms).some(perms => perms.includes('orchestrator:use'))
})
const canWrite = computed(() => {
  if (permissions.isGlobalAdmin.value)
    return true
  const orgPerms = permissions.data.value?.organisations ?? {}
  return Object.values(orgPerms).some(perms => perms.includes('orchestrator:write'))
})

// ─── Data ──────────────────────────────────────────────────────────────────
const { conversation, messages, isLoading, error, refetch } = useConversation(conversationId)

// Local form state mirrors the conversation, mutations PATCH on commit.
const titleInput = ref('')
const modelInput = ref<string | null>(null)
const modeInput = ref<ConversationMode>('read_only')

watch(conversation, (c) => {
  if (!c)
    return
  titleInput.value = c.title
  modelInput.value = c.modelId
  modeInput.value = c.mode
}, { immediate: true })

// ─── Eligible models ───────────────────────────────────────────────────────
const { eligibleModels, isLoading: modelsLoading } = useEligibleModels()

const modelOptions = computed(() => [
  { value: null as string | null, label: t('orchestrator.chat.modelPicker.default') },
  ...eligibleModels.value.map(m => ({
    value: m.id,
    label: `${m.providerDisplayName} · ${m.displayName}`,
  })),
])

const noModels = computed(() => !modelsLoading.value && eligibleModels.value.length === 0)

// ─── Mutations ─────────────────────────────────────────────────────────────
const updateMutation = useUpdateConversation()

const persistTitle = async () => {
  if (!conversation.value)
    return
  const next = titleInput.value.trim()
  if (next === conversation.value.title)
    return
  try {
    await updateMutation.mutateAsync({
      id: conversation.value.id,
      data: { title: next },
    })
  }
  catch (err) {
    toast.add({
      title: t('orchestrator.errors.update.title'),
      description: err instanceof Error ? err.message : undefined,
      color: 'error',
    })
    titleInput.value = conversation.value.title
  }
}

const persistModel = async (next: string | null) => {
  if (!conversation.value)
    return
  try {
    await updateMutation.mutateAsync({
      id: conversation.value.id,
      data: { modelId: next },
    })
    toast.add({
      title: t('orchestrator.chat.toast.modelSaved'),
      color: 'success',
    })
  }
  catch (err) {
    toast.add({
      title: t('orchestrator.errors.update.title'),
      description: err instanceof Error ? err.message : undefined,
      color: 'error',
    })
    // Roll back the local picker.
    modelInput.value = conversation.value.modelId
  }
}

watch(modelInput, (next, prev) => {
  if (!conversation.value)
    return
  if (next === conversation.value.modelId)
    return
  if (prev === undefined)
    return
  void persistModel(next)
})

// ─── Mode toggle ───────────────────────────────────────────────────────────
const modeConfirmOpen = ref(false)

const persistMode = async (next: ConversationMode) => {
  if (!conversation.value)
    return
  try {
    await updateMutation.mutateAsync({
      id: conversation.value.id,
      data: { mode: next },
    })
    modeInput.value = next
    toast.add({
      title: next === 'read_write'
        ? t('orchestrator.chat.toast.writeEnabled')
        : t('orchestrator.chat.toast.writeDisabled'),
      color: 'success',
    })
  }
  catch (err) {
    toast.add({
      title: t('orchestrator.errors.update.title'),
      description: err instanceof Error ? err.message : undefined,
      color: 'error',
    })
  }
}

const confirmModeWrite = async () => {
  modeConfirmOpen.value = false
  await persistMode('read_write')
}

const onModeToggleClick = () => {
  if (!conversation.value)
    return
  if (!canWrite.value)
    return
  if (conversation.value.mode === 'read_only') {
    modeConfirmOpen.value = true
  }
  else {
    void persistMode('read_only')
  }
}

// ─── Message rendering helpers ─────────────────────────────────────────────
const isTextBlock = (b: MessageContentBlock): b is MessageTextBlock =>
  Boolean(b) && (b as { type?: string }).type === 'text'
const isToolCallBlock = (b: MessageContentBlock): b is MessageToolCallBlock =>
  Boolean(b) && (b as { type?: string }).type === 'tool-call'
const isToolResultBlock = (b: MessageContentBlock): b is MessageToolResultBlock =>
  Boolean(b) && (b as { type?: string }).type === 'tool-result'

const messageBlocks = (m: ConversationMessage): MessageContentBlock[] => {
  if (Array.isArray(m.content))
    return m.content as MessageContentBlock[]
  if (typeof m.content === 'string')
    return [{ type: 'text', text: m.content }]
  return []
}

const messageTextSummary = (m: ConversationMessage): string => {
  return messageBlocks(m)
    .filter(isTextBlock)
    .map(b => b.text)
    .join('\n')
}

const messageHasTools = (m: ConversationMessage): boolean =>
  messageBlocks(m).some(b => isToolCallBlock(b) || isToolResultBlock(b))

const formatTime = (iso: string) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime()))
    return iso
  return new Intl.DateTimeFormat(locale.value, {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(d)
}

const roleLabel = (role: ConversationMessage['role']): string =>
  t(`orchestrator.chat.role.${role}`)

// ─── Streaming state (T-3.15) ──────────────────────────────────────────────
const stream = useChatStream()
const liveText = ref<Map<string, string>>(new Map())
const liveToolCalls = ref<LiveToolCall[]>([])
const liveToolResults = ref<LiveToolResult[]>([])
const pendingConfirmation = ref<PendingConfirmation | null>(null)
const streamError = ref<StreamErrorState | null>(null)
const optimisticUserText = ref<string | null>(null)

const liveTextValues = computed(() => Array.from(liveText.value.values()).filter(Boolean))

const hasLiveContent = computed(() =>
  optimisticUserText.value !== null
  || liveTextValues.value.length > 0
  || liveToolCalls.value.length > 0
  || liveToolResults.value.length > 0,
)

const resetLiveState = () => {
  liveText.value = new Map()
  liveToolCalls.value = []
  liveToolResults.value = []
  optimisticUserText.value = null
}

const handleEvent = (ev: ChatEvent) => {
  switch (ev.type) {
    case 'text-delta': {
      const next = new Map(liveText.value)
      next.set(ev.messageId, (next.get(ev.messageId) ?? '') + ev.delta)
      liveText.value = next
      break
    }
    case 'tool-call': {
      liveToolCalls.value = [
        ...liveToolCalls.value,
        { toolCallId: ev.toolCallId, toolName: ev.toolName, input: ev.input },
      ]
      break
    }
    case 'tool-result': {
      liveToolResults.value = [
        ...liveToolResults.value,
        { toolCallId: ev.toolCallId, actionId: ev.actionId, result: ev.result },
      ]
      break
    }
    case 'confirmation_required': {
      pendingConfirmation.value = {
        toolCallId: ev.toolCallId,
        actionId: ev.actionId,
        toolName: ev.toolName,
        input: ev.input,
        affectedCount: ev.affectedCount,
        reason: ev.reason,
      }
      break
    }
    case 'message-complete': {
      // Persisted row will replace the live state once the refetch lands.
      void refetch().then(() => {
        // Clear live state only after the refetch settles so the UI doesn't
        // flash empty in the gap between live drop and persisted hydrate.
        resetLiveState()
      })
      break
    }
    case 'error': {
      streamError.value = { code: ev.code, message: ev.message }
      break
    }
  }
}

stream.onEvent(handleEvent)

// ─── Pending confirmation card ─────────────────────────────────────────────
const onConfirmationConfirmed = async ({ actionId }: { actionId: string }) => {
  if (!conversation.value)
    return
  pendingConfirmation.value = null
  streamError.value = null
  await stream.start(orchestratorStreamPaths.confirm(conversation.value.id), { actionId })
}

const onConfirmationCancelled = async ({ actionId }: { actionId: string }) => {
  if (!conversation.value)
    return
  pendingConfirmation.value = null
  streamError.value = null
  await stream.start(orchestratorStreamPaths.cancel(conversation.value.id), { actionId })
}

// Dev-only escape hatch retained from T-3.14 so the card can be exercised
// without standing up an SSE turn.
if (import.meta.dev && import.meta.client) {
  ;(globalThis as Record<string, unknown>).__setPendingConfirmation = (
    next: PendingConfirmation | null,
  ) => {
    pendingConfirmation.value = next
  }
}

// ─── Composer ──────────────────────────────────────────────────────────────
const composerInput = ref('')

const composerDisabledReason = computed(() => {
  if (!canUse.value)
    return t('orchestrator.chat.composer.noPermissionTooltip')
  if (noModels.value)
    return t('orchestrator.chat.composer.noModelsTooltip')
  return ''
})

const composerDisabled = computed(() =>
  !canUse.value || noModels.value || stream.isStreaming.value || pendingConfirmation.value !== null,
)

const sendDisabled = computed(() =>
  composerDisabled.value || composerInput.value.trim().length === 0,
)

const onSend = async () => {
  if (!conversation.value)
    return
  const text = composerInput.value.trim()
  if (text.length === 0)
    return
  streamError.value = null
  optimisticUserText.value = text
  composerInput.value = ''
  await stream.start(
    orchestratorStreamPaths.messages(conversation.value.id),
    { content: text },
  )
}

const onStop = () => {
  stream.abort()
  toast.add({
    title: t('orchestrator.chat.toast.aborted'),
    color: 'warning',
  })
}

const onRetry = async () => {
  streamError.value = null
  await stream.retry()
}

const onComposerKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    if (!sendDisabled.value)
      void onSend()
  }
}

const streamErrorMessage = computed(() => {
  if (!streamError.value)
    return ''
  if (streamError.value.code === 'connection_lost')
    return t('orchestrator.chat.stream.errors.connection_lost')
  return streamError.value.message || t('orchestrator.chat.stream.errors.generic')
})

// ─── Lifecycle ─────────────────────────────────────────────────────────────
onMounted(() => {
  void refetch()
})

onBeforeUnmount(() => {
  stream.abort()
})
</script>

<template>
  <div class="p-4 md:p-6 space-y-4 max-w-5xl">
    <UAlert
      v-if="!canUse"
      color="warning"
      variant="soft"
      icon="i-lucide-shield-alert"
      :title="t('orchestrator.permissions.denied.title')"
      :description="t('orchestrator.permissions.denied.description')"
    />

    <template v-else>
      <header class="flex items-start justify-between gap-3 flex-wrap">
        <div class="flex items-center gap-2 min-w-0">
          <UButton
            variant="ghost"
            size="sm"
            icon="i-lucide-arrow-left"
            :label="t('orchestrator.chat.back')"
            to="/app/orchestrator"
          />
        </div>
      </header>

      <UAlert
        v-if="error"
        color="error"
        variant="soft"
        icon="i-lucide-alert-circle"
        :title="t('orchestrator.errors.load.title')"
        :description="error.message"
      />

      <div v-if="isLoading && !conversation" class="space-y-3">
        <USkeleton class="h-12 w-full" />
        <USkeleton class="h-32 w-full" />
      </div>

      <template v-else-if="conversation">
        <!-- Conversation header card: title + mode toggle + model picker -->
        <UCard>
          <div class="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-4 items-start">
            <UFormField
              :label="t('orchestrator.chat.titleField.label')"
              :description="t('orchestrator.chat.titleField.description')"
            >
              <UInput
                v-model="titleInput"
                :placeholder="t('orchestrator.chat.titleField.placeholder')"
                @blur="persistTitle"
                @keydown.enter.prevent="persistTitle"
              />
            </UFormField>

            <div class="flex items-end gap-2 flex-wrap justify-end">
              <UTooltip
                :text="composerInput && !canWrite ? t('orchestrator.permissions.write.tooltip') : ''"
                :disabled="canWrite"
              >
                <div class="flex items-center gap-2">
                  <UBadge
                    :color="conversation.mode === 'read_write' ? 'warning' : 'neutral'"
                    variant="subtle"
                  >
                    {{ t(`orchestrator.modes.${conversation.mode}`) }}
                  </UBadge>
                  <UButton
                    :color="conversation.mode === 'read_write' ? 'warning' : 'primary'"
                    variant="outline"
                    size="sm"
                    :label="conversation.mode === 'read_only'
                      ? t('orchestrator.chat.mode.enableWrite')
                      : t('orchestrator.chat.mode.disableWrite')"
                    :disabled="!canWrite || updateMutation.asyncStatus.value === 'loading'"
                    @click="onModeToggleClick"
                  />
                </div>
              </UTooltip>
            </div>
          </div>

          <UFormField
            :label="t('orchestrator.chat.modelPicker.label')"
            :description="t('orchestrator.chat.modelPicker.description')"
            class="mt-4"
          >
            <USelectMenu
              v-model="modelInput"
              :items="modelOptions"
              value-key="value"
              label-key="label"
              :placeholder="t('orchestrator.chat.modelPicker.default')"
              :disabled="modelsLoading || noModels"
              class="min-w-72"
            />
          </UFormField>

          <UAlert
            v-if="noModels"
            class="mt-3"
            color="warning"
            variant="soft"
            icon="i-lucide-alert-triangle"
            :title="t('orchestrator.chat.noModels.title')"
            :description="t('orchestrator.chat.noModels.description')"
          >
            <template #actions>
              <UButton
                size="sm"
                color="warning"
                variant="solid"
                icon="i-lucide-settings"
                :label="t('orchestrator.chat.noModels.action')"
                to="/app/settings/ai"
              />
            </template>
          </UAlert>
        </UCard>

        <!-- Message history -->
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h2 class="text-base font-semibold text-highlighted">
                {{ t('orchestrator.chat.messages.title') }}
              </h2>
              <span class="text-xs text-muted">
                {{ t('orchestrator.chat.messages.count', { n: messages.length }) }}
              </span>
            </div>
          </template>

          <div v-if="messages.length === 0 && !hasLiveContent" class="text-sm text-muted py-8 text-center">
            {{ t('orchestrator.chat.messages.empty') }}
          </div>

          <ul v-else class="space-y-4">
            <li
              v-for="message in messages"
              :key="message.id"
              class="flex gap-3"
            >
              <div class="shrink-0 w-20 text-xs text-muted">
                <p class="font-medium uppercase tracking-wide text-highlighted">
                  {{ roleLabel(message.role) }}
                </p>
                <p class="font-mono">
                  {{ formatTime(message.createdAt) }}
                </p>
              </div>
              <div class="flex-1 min-w-0 space-y-2">
                <p
                  v-if="messageTextSummary(message)"
                  class="whitespace-pre-wrap text-sm"
                >
                  {{ messageTextSummary(message) }}
                </p>
                <ul
                  v-if="messageHasTools(message)"
                  class="space-y-2"
                >
                  <li
                    v-for="(block, idx) in messageBlocks(message)"
                    :key="`${message.id}-${idx}`"
                  >
                    <ToolCallCard
                      v-if="isToolCallBlock(block)"
                      :tool-call-id="block.toolCallId ?? ''"
                      :tool-name="block.toolName"
                      :input="block.input"
                    />
                    <ToolResultCard
                      v-else-if="isToolResultBlock(block)"
                      :tool-call-id="block.toolCallId ?? ''"
                      :tool-name="block.toolName"
                      :output="block.output"
                    />
                  </li>
                </ul>
                <p
                  v-if="!messageTextSummary(message) && !messageHasTools(message)"
                  class="text-xs text-muted italic"
                >
                  {{ t('orchestrator.chat.messages.emptyBlock') }}
                </p>
              </div>
            </li>

            <!-- Live trailing block built from the in-flight stream events.
                 Replaced by the persisted rows after `message-complete`. -->
            <li
              v-if="optimisticUserText !== null"
              class="flex gap-3 opacity-90"
            >
              <div class="shrink-0 w-20 text-xs text-muted">
                <p class="font-medium uppercase tracking-wide text-highlighted">
                  {{ roleLabel('user') }}
                </p>
                <p class="italic">
                  {{ t('orchestrator.chat.stream.live.label') }}
                </p>
              </div>
              <div class="flex-1 min-w-0">
                <p class="whitespace-pre-wrap text-sm">
                  {{ optimisticUserText }}
                </p>
              </div>
            </li>

            <li
              v-if="liveTextValues.length > 0 || liveToolCalls.length > 0 || liveToolResults.length > 0"
              class="flex gap-3"
            >
              <div class="shrink-0 w-20 text-xs text-muted">
                <p class="font-medium uppercase tracking-wide text-highlighted">
                  {{ t('orchestrator.chat.stream.live.assistant') }}
                </p>
                <p class="italic flex items-center gap-1">
                  <UIcon
                    v-if="stream.isStreaming.value"
                    name="i-lucide-loader-2"
                    class="size-3 animate-spin"
                  />
                  {{ t('orchestrator.chat.stream.live.label') }}
                </p>
              </div>
              <div class="flex-1 min-w-0 space-y-2">
                <p
                  v-for="(text, i) in liveTextValues"
                  :key="`live-text-${i}`"
                  class="whitespace-pre-wrap text-sm"
                >
                  {{ text }}
                </p>
                <ul v-if="liveToolCalls.length > 0" class="space-y-2">
                  <li
                    v-for="call in liveToolCalls"
                    :key="`live-call-${call.toolCallId}`"
                  >
                    <ToolCallCard
                      :tool-call-id="call.toolCallId"
                      :tool-name="call.toolName"
                      :input="call.input"
                    />
                  </li>
                </ul>
                <ul v-if="liveToolResults.length > 0" class="space-y-2">
                  <li
                    v-for="result in liveToolResults"
                    :key="`live-result-${result.toolCallId}`"
                  >
                    <ToolResultCard
                      :tool-call-id="result.toolCallId"
                      :tool-name="result.toolName"
                      :output="result.result"
                    />
                  </li>
                </ul>
              </div>
            </li>
          </ul>
        </UCard>

        <!-- Stream error alert -->
        <UAlert
          v-if="streamError"
          color="error"
          variant="soft"
          icon="i-lucide-alert-circle"
          :title="t('orchestrator.chat.stream.errors.title')"
          :description="streamErrorMessage"
        >
          <template #actions>
            <UButton
              v-if="streamError.code === 'connection_lost'"
              size="sm"
              color="error"
              variant="solid"
              icon="i-lucide-refresh-ccw"
              :label="t('orchestrator.chat.composer.retry')"
              :disabled="stream.isStreaming.value"
              @click="onRetry"
            />
          </template>
        </UAlert>

        <!-- Pending confirmation card (T-3.14) -->
        <ConfirmationCard
          v-if="pendingConfirmation"
          :conversation-id="conversation.id"
          :action-id="pendingConfirmation.actionId"
          :tool-name="pendingConfirmation.toolName"
          :input="pendingConfirmation.input"
          :affected-count="pendingConfirmation.affectedCount"
          :reason="pendingConfirmation.reason"
          :busy="stream.isStreaming.value"
          @confirmed="onConfirmationConfirmed"
          @cancelled="onConfirmationCancelled"
        />

        <!-- Composer (T-3.15) -->
        <UCard>
          <UFormField
            :label="t('orchestrator.chat.composer.label')"
            :description="t('orchestrator.chat.composer.description')"
          >
            <UTextarea
              v-model="composerInput"
              :rows="3"
              :placeholder="t('orchestrator.chat.composer.placeholder')"
              :disabled="composerDisabled"
              @keydown="onComposerKeydown"
            />
          </UFormField>
          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton
                v-if="stream.isStreaming.value"
                color="neutral"
                variant="outline"
                icon="i-lucide-square"
                :label="t('orchestrator.chat.composer.stop')"
                @click="onStop"
              />
              <UTooltip
                :text="composerDisabledReason"
                :disabled="!composerDisabledReason"
              >
                <UButton
                  icon="i-lucide-send"
                  :label="t('orchestrator.chat.composer.send')"
                  :disabled="sendDisabled"
                  :loading="stream.isStreaming.value"
                  @click="onSend"
                />
              </UTooltip>
            </div>
          </template>
        </UCard>
      </template>
    </template>

    <UModal
      v-model:open="modeConfirmOpen"
      :title="t('orchestrator.chat.mode.confirm.title')"
    >
      <template #body>
        <p class="text-sm">
          {{ t('orchestrator.chat.mode.confirm.body') }}
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :label="t('common.cancel')"
            @click="modeConfirmOpen = false"
          />
          <UButton
            color="warning"
            :label="t('orchestrator.chat.mode.confirm.action')"
            :loading="updateMutation.asyncStatus.value === 'loading'"
            @click="confirmModeWrite"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
