<script setup lang="ts">
/**
 * Password generator popover (T-V-27, REQ-VAULT-20).
 *
 * Exposes length slider + character-class toggles. Emits the generated
 * password to the parent when the user clicks "Use this password";
 * popover closes on use.
 */
import { generatePassword } from '../utils/passwordGenerator'

const emit = defineEmits<{
  generated: [password: string]
}>()

const { t } = useI18n()

const length = ref(24)
const lowercase = ref(true)
const uppercase = ref(true)
const digits = ref(true)
const symbols = ref(true)
const generated = ref<string>('')
const error = ref<string | null>(null)

const regenerate = () => {
  error.value = null
  try {
    generated.value = generatePassword({
      length: length.value,
      lowercase: lowercase.value,
      uppercase: uppercase.value,
      digits: digits.value,
      symbols: symbols.value,
    })
  }
  catch (err) {
    generated.value = ''
    error.value = err instanceof Error ? err.message : 'unknown'
  }
}

// Generate one on mount so the popover opens with a usable suggestion.
onMounted(regenerate)

watch([length, lowercase, uppercase, digits, symbols], () => {
  regenerate()
})

const onUse = () => {
  if (!generated.value)
    return
  emit('generated', generated.value)
}
</script>

<template>
  <div class="p-3 space-y-3 w-72">
    <h3 class="text-sm font-semibold text-highlighted">
      {{ t('vault.passwordGenerator.title') }}
    </h3>

    <div class="space-y-2">
      <p class="text-xs text-muted">
        {{ t('vault.passwordGenerator.lengthLabel', { length }) }}
      </p>
      <USlider v-model="length" :min="8" :max="64" :step="1" />
    </div>

    <div class="space-y-1.5 text-sm">
      <UCheckbox v-model="lowercase" :label="t('vault.passwordGenerator.lowercase')" />
      <UCheckbox v-model="uppercase" :label="t('vault.passwordGenerator.uppercase')" />
      <UCheckbox v-model="digits" :label="t('vault.passwordGenerator.digits')" />
      <UCheckbox v-model="symbols" :label="t('vault.passwordGenerator.symbols')" />
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="soft"
      :title="t('vault.passwordGenerator.noClassesSelected')"
    />

    <div v-if="generated" class="font-mono text-sm bg-default border border-default rounded p-2 break-all">
      {{ generated }}
    </div>

    <div class="flex justify-end gap-2">
      <UButton
        color="neutral"
        variant="ghost"
        size="sm"
        icon="i-lucide-refresh-cw"
        :label="t('vault.passwordGenerator.regenerate')"
        @click="regenerate"
      />
      <UButton
        color="primary"
        size="sm"
        icon="i-lucide-check"
        :label="t('vault.passwordGenerator.use')"
        :disabled="!generated"
        @click="onUse"
      />
    </div>
  </div>
</template>
