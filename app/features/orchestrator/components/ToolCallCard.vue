<script setup lang="ts">
/**
 * ToolCallCard (T-3.14) — renders an AI SDK `tool-call` content block as a
 * compact card with the tool name, a copy-toolCallId affordance, and a
 * collapsible JSON-pretty body. Collapsed by default so historical messages
 * with many tool calls stay scannable.
 *
 * The colour family deliberately matches `ToolResultCard.vue` so the two
 * cards read as a visual pair when stacked.
 */
const props = defineProps<{
  toolCallId: string
  toolName: string
  input: unknown
}>()

const { t } = useI18n()
const toast = useToast()

const expanded = ref(false)
const toggle = () => {
  expanded.value = !expanded.value
}

const prettyInput = computed(() => {
  try {
    return JSON.stringify(props.input, null, 2)
  }
  catch {
    return String(props.input ?? '')
  }
})

const copyId = async () => {
  if (!props.toolCallId)
    return
  try {
    await navigator.clipboard.writeText(props.toolCallId)
    toast.add({
      title: t('orchestrator.toolCall.copied'),
      color: 'success',
    })
  }
  catch {
    toast.add({
      title: t('orchestrator.toolCall.copyFailed'),
      color: 'error',
    })
  }
}
</script>

<template>
  <div
    class="border border-default rounded-md bg-elevated overflow-hidden"
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
      <UIcon name="i-lucide-wrench" class="size-4 text-primary shrink-0" />
      <span class="font-mono text-xs text-highlighted truncate">
        {{ toolName }}
      </span>
      <span class="ml-auto flex items-center gap-1">
        <UButton
          v-if="toolCallId"
          color="neutral"
          variant="ghost"
          size="xs"
          icon="i-lucide-copy"
          :aria-label="t('orchestrator.toolCall.copyId')"
          :title="t('orchestrator.toolCall.copyId')"
          @click.stop="copyId"
        />
      </span>
    </UButton>
    <div
      v-if="expanded"
      class="border-t border-default px-3 py-2 bg-default"
    >
      <p class="text-xs text-muted uppercase tracking-wide mb-1">
        {{ t('orchestrator.toolCall.parameters') }}
      </p>
      <pre class="text-xs overflow-auto max-h-64 whitespace-pre-wrap break-words font-mono"><code>{{ prettyInput }}</code></pre>
    </div>
  </div>
</template>
