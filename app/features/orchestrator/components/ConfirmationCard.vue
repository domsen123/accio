<script setup lang="ts">
/**
 * ConfirmationCard (T-3.14, refined T-3.15) — renders a `confirmation_required`
 * SSE event as a prominent warning card with Confirm / Cancel buttons.
 *
 * The card is now a pure presentation component: it emits `confirmed` /
 * `cancelled` (carrying the `actionId`) and the parent page kicks off the
 * resumed SSE stream via `useChatStream`. Pre-T-3.15 the card owned the
 * fire-and-forget mutations; that path doubled the request layers and made
 * incremental rendering of the resumed turn awkward.
 *
 * The `busy` prop disables both buttons while a parent-driven stream is in
 * flight (e.g. another confirmation already mid-resume) — defaults to false.
 */

const props = withDefaults(
  defineProps<{
    conversationId: string
    actionId: string
    toolName: string
    input: unknown
    affectedCount: number
    reason: 'class' | 'bulk'
    busy?: boolean
  }>(),
  { busy: false },
)

const emit = defineEmits<{
  confirmed: [{ actionId: string }]
  cancelled: [{ actionId: string }]
}>()

const { t } = useI18n()

const prettyInput = computed(() => {
  try {
    return JSON.stringify(props.input, null, 2)
  }
  catch {
    return String(props.input ?? '')
  }
})

const reasonText = computed(() => {
  if (props.reason === 'bulk')
    return t('orchestrator.confirmation.reason.bulk', { n: props.affectedCount })
  return t('orchestrator.confirmation.reason.class')
})

const isVaultSecret = computed(() => props.toolName === 'vault_get_secret')

const cardUi = computed(() => ({
  root: isVaultSecret.value
    ? 'bg-elevated border border-error'
    : 'bg-elevated border border-default',
}))

const onConfirm = () => {
  emit('confirmed', { actionId: props.actionId })
}

const onCancel = () => {
  emit('cancelled', { actionId: props.actionId })
}
</script>

<template>
  <UCard
    :ui="cardUi"
    :data-conversation-id="conversationId"
  >
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon
          :name="isVaultSecret ? 'i-lucide-shield-alert' : 'i-lucide-shield'"
          class="size-5 shrink-0"
          :class="isVaultSecret ? 'text-error' : 'text-muted'"
        />
        <div class="min-w-0">
          <h3 class="text-sm font-semibold text-highlighted">
            {{ t('orchestrator.confirmation.title') }}
          </h3>
          <p class="text-xs text-muted font-mono truncate">
            {{ toolName }}
          </p>
        </div>
      </div>
    </template>

    <div class="space-y-3">
      <UAlert
        v-if="isVaultSecret"
        color="error"
        variant="soft"
        icon="i-lucide-alert-triangle"
        :title="t('orchestrator.confirmation.vaultWarning')"
      />
      <p class="text-sm text-default">
        {{ reasonText }}
      </p>
      <div>
        <p class="text-xs text-muted uppercase tracking-wide mb-1">
          {{ t('orchestrator.confirmation.parameters') }}
        </p>
        <pre class="text-xs overflow-auto max-h-64 whitespace-pre-wrap break-words font-mono bg-default border border-default rounded p-2"><code>{{ prettyInput }}</code></pre>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          :label="t('orchestrator.confirmation.actions.cancel')"
          :disabled="busy"
          @click="onCancel"
        />
        <UButton
          :color="isVaultSecret ? 'error' : 'primary'"
          size="sm"
          :label="t('orchestrator.confirmation.actions.confirm')"
          :disabled="busy"
          @click="onConfirm"
        />
      </div>
    </template>
  </UCard>
</template>
