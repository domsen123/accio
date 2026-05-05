<script setup lang="ts">
/**
 * Live preview pane for the KB Markdown editor (T-1.9).
 *
 * The preview is non-authoritative — the user authors raw Markdown in a
 * textarea on the left, and this component renders the right-hand pane.
 *
 * Wikilink resolution: we collect the unique target slugs in the body and
 * fire the bulk-resolve endpoint once per body change (debounced by the
 * caller via a `body` ref). Resolved slugs render as standard `<a>` links;
 * unresolved ones get a `kb-wikilink--unresolved` class plus a small "?"
 * badge. Both navigate to `/app/kb/<slug>` so creating the missing entry
 * from the preview is a one-click action.
 *
 * Click-handling: the preview HTML is rendered via `v-html`, so wikilinks
 * are real `<a href="/app/kb/...">` tags — the browser navigates without
 * extra plumbing. We intercept clicks at the wrapper level to call
 * `router.push()` for SPA navigation; modifier-key clicks (cmd/ctrl/middle-
 * click) fall through to the browser default so "open in new tab" works.
 */
import { useKbResolveSlugs } from '../composables/useKbResolveSlugs'
import { extractWikilinkTargets, renderKbMarkdown } from '../utils/renderMarkdown'

const props = defineProps<{
  body: string
}>()

const { t } = useI18n()
const router = useRouter()

const targets = computed(() => extractWikilinkTargets(props.body ?? ''))

const { isResolved } = useKbResolveSlugs(targets)

const html = computed(() => {
  const body = props.body ?? ''
  if (!body.trim())
    return ''
  return renderKbMarkdown(body, {
    isResolved,
    hrefFor: (slug: string) => `/app/kb/${encodeURIComponent(slug)}`,
  })
})

const onClickPreview = (event: MouseEvent) => {
  const target = (event.target as HTMLElement | null)?.closest('a[data-kb-wikilink]')
  if (!target)
    return
  // Honour modifier-key clicks so "open in new tab" still works.
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    return
  if (event.button !== 0)
    return
  const href = target.getAttribute('href')
  if (!href)
    return
  event.preventDefault()
  router.push(href)
}
</script>

<template>
  <div
    class="kb-markdown-preview prose prose-neutral dark:prose-invert max-w-none text-sm"
    @click="onClickPreview"
  >
    <p
      v-if="!html"
      class="italic text-muted text-sm"
    >
      {{ t('kb.editor.preview.empty') }}
    </p>
    <!-- eslint-disable-next-line vue/no-v-html -->
    <div v-else v-html="html" />
  </div>
</template>

<style>
.kb-markdown-preview .kb-wikilink {
  display: inline-flex;
  align-items: center;
  gap: 0.125rem;
  color: var(--ui-primary, #6366f1);
  text-decoration: none;
  border-bottom: 1px dashed transparent;
}

.kb-markdown-preview .kb-wikilink--resolved {
  color: var(--ui-primary, #6366f1);
  border-bottom-color: currentColor;
}

.kb-markdown-preview .kb-wikilink--resolved:hover {
  text-decoration: underline;
}

.kb-markdown-preview .kb-wikilink--unresolved {
  color: var(--ui-text-muted, #6b7280);
  border-bottom-style: dotted;
  border-bottom-color: currentColor;
  font-style: italic;
}

.kb-markdown-preview .kb-wikilink__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 0.125rem;
  padding: 0 0.25rem;
  border: 1px solid currentColor;
  border-radius: 9999px;
  font-size: 0.65em;
  line-height: 1;
  font-style: normal;
  font-weight: 600;
}
</style>
