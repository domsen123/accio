<script setup lang="ts">
/**
 * ToolResultCard (T-3.14) — renders an AI SDK `tool-result` content block.
 * Linked back to its `ToolCallCard` via `toolCallId` (same `data-` attribute
 * and matching left-border colour). Collapsed by default; expanding reveals
 * the pretty-printed output.
 *
 * Recognises the synthetic cancellation envelope (T-3.12):
 *   `{ cancelled: true, reason: 'user_cancelled' }`
 * and surfaces a friendly line in place of the raw JSON when matched.
 */
type Status = 'executed' | 'cancelled' | 'failed'

const props = defineProps<{
  toolCallId: string
  toolName?: string
  output: unknown
  error?: string | null
  status?: Status
}>()

const { t } = useI18n()

const expanded = ref(false)
const toggle = () => {
  expanded.value = !expanded.value
}

const isCancelledShape = (o: unknown): boolean => {
  if (!o || typeof o !== 'object')
    return false
  const rec = o as Record<string, unknown>
  return rec.cancelled === true && rec.reason === 'user_cancelled'
}

const effectiveStatus = computed<Status>(() => {
  if (props.status)
    return props.status
  if (props.error)
    return 'failed'
  if (isCancelledShape(props.output))
    return 'cancelled'
  return 'executed'
})

const statusColor = computed(() => {
  switch (effectiveStatus.value) {
    case 'cancelled': return 'neutral' as const
    case 'failed': return 'error' as const
    default: return 'success' as const
  }
})

const showCancelledMessage = computed(() =>
  effectiveStatus.value === 'cancelled' && isCancelledShape(props.output),
)

const prettyOutput = computed(() => {
  try {
    return JSON.stringify(props.output, null, 2)
  }
  catch {
    return String(props.output ?? '')
  }
})
</script>

<template>
  <div
    class="border border-default rounded-md bg-elevated overflow-hidden border-l-2"
    :class="{
      'border-l-success': effectiveStatus === 'executed',
      'border-l-neutral': effectiveStatus === 'cancelled',
      'border-l-error': effectiveStatus === 'failed',
    }"
    :data-tool-call-id="toolCallId"
  >
    <UButton
      color="neutral"
      variant="ghost"
      block
      :ui="{ base: 'justify-start gap-2 px-3 py-2 rounded-none' }"
      :aria-expanded="expanded"
      @click="toggle"
    >
      <UIcon
        :name="expanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
        class="size-4 text-muted shrink-0"
      />
      <UIcon name="i-lucide-corner-down-right" class="size-4 text-muted shrink-0" />
      <span class="font-mono text-xs text-highlighted truncate">
        {{ toolName ?? t('orchestrator.toolResult.untitled') }}
      </span>
      <UBadge
        :color="statusColor"
        variant="subtle"
        size="sm"
        class="ml-auto"
      >
        {{ t(`orchestrator.toolResult.status.${effectiveStatus}`) }}
      </UBadge>
    </UButton>
    <div
      v-if="expanded"
      class="border-t border-default px-3 py-2 bg-default space-y-2"
    >
      <p
        v-if="error"
        class="text-xs text-error font-mono whitespace-pre-wrap break-words"
      >
        {{ error }}
      </p>
      <p
        v-else-if="showCancelledMessage"
        class="text-xs text-muted italic"
      >
        {{ t('orchestrator.toolResult.cancelledMessage') }}
      </p>
      <template v-else>
        <p class="text-xs text-muted uppercase tracking-wide mb-1">
          {{ t('orchestrator.toolResult.output') }}
        </p>
        <pre class="text-xs overflow-auto max-h-64 whitespace-pre-wrap break-words font-mono"><code>{{ prettyOutput }}</code></pre>
      </template>
    </div>
  </div>
</template>
