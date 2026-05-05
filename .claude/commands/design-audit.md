---
description: Audit a page or component for design system compliance against DESIGN.md
argument-hint: "[path to page or component, e.g. app/pages/app/kb/index.vue]"
---

Audit the file(s) at $ARGUMENTS for design system compliance against DESIGN.md.

If $ARGUMENTS is empty, ask which file or folder to audit before proceeding.

**Do not change any code.** Produce a report only.

## Steps

1. Read `DESIGN.md` to load the design system rules.
2. Identify the files in scope (a single `.vue` file, or all `.vue` files under a given folder).
3. For each file, scan for the deviations listed in §Audit checks below.
4. Categorise findings per file:
   - **critical** — breaks design system principles (hardcoded hex, custom shadows, non-semantic colors, hardcoded `dark:` overrides, custom radius values outside the scale)
   - **major** — inconsistent token usage (wrong card pattern, missing `bg-elevated` on cards, inconsistent spacing, wrong typography size for context, missing `font-mono` on numbers/IDs)
   - **minor** — polish (suboptimal icon sizes, slightly off spacing, missing hover states, missing transitions)

## Audit checks

### Color and theme
- [ ] No hardcoded hex values (`#xxxxxx`, `rgb(...)`, `rgba(...)`) in templates or scoped styles
- [ ] No raw Tailwind shade utilities (`bg-zinc-900`, `text-gray-400`, `border-slate-700`) — must use semantic utilities (`bg-default`, `text-muted`, `border-default`)
- [ ] No `dark:` prefix overrides — semantic utilities auto-resolve
- [ ] No `bg-white`, `bg-black`, `text-white`, `text-black` — use `bg-default`, `bg-inverted`, `text-default`, `text-inverted`
- [ ] Color shades come via Nuxt UI props (`color="primary"`, `color="error"`), not direct classes

### Cards and surfaces
- [ ] All "card" containers use `bg-elevated` (not `bg-default`, `bg-muted`, or hardcoded backgrounds)
- [ ] All cards use `border border-default` for hairline definition
- [ ] No `shadow-*` classes for elevation — depth via `bg-elevated` only
- [ ] Card border-radius is consistent: `rounded-lg` (8px) for content cards, `rounded-xl` (12px) for elevated/large cards. No `rounded-2xl` outside marketing surfaces. No custom `rounded-[Npx]` values.
- [ ] Card internal padding is consistent within the same view: `p-4`, `p-5`, or `p-6` — not mixed without reason
- [ ] No nested cards inside cards without justification (use `bg-accented` for nested emphasis instead)

### Typography
- [ ] Numbers, dates, durations, IDs, file sizes, key fingerprints, code snippets use `font-mono`
- [ ] Body text defaults to `text-sm` (14px), not `text-base`
- [ ] Display sizes use `font-bold` (700) or `font-semibold` (600) — not `font-medium` or lighter
- [ ] No inline `style="font-size: ..."` or arbitrary `text-[Npx]` outside the documented scale
- [ ] Tracking/letter-spacing only on display sizes via `tracking-tight`; no custom tracking values

### Spacing
- [ ] Spacing values are Tailwind tokens (`p-4`, `gap-6`, `mt-8`) — no arbitrary `p-[Npx]` or inline pixel values
- [ ] Internal card padding is consistent within a view (don't mix `p-4` and `p-6` on sibling cards)
- [ ] Major editorial section padding is `py-20` (80px) or via `<UPageHeader>` defaults
- [ ] Stack spacing uses `space-y-*` or `gap-*`, not individual `mt-*` on each child

### Buttons and interactive elements
- [ ] All buttons use `<UButton>` from Nuxt UI — no `<button>` with custom styling
- [ ] Button color is set via `color` prop, not background utility
- [ ] Button variant is set via `variant` prop (`solid`, `outline`, `subtle`, `ghost`, `link`)
- [ ] Primary CTAs use `color="primary"` — yellow + dark text combination, not inverted
- [ ] Destructive actions use `color="error"` and are paired with confirmation
- [ ] Button sizes are explicit: `xs`, `sm`, `md`, `lg`, `xl` — no custom heights

### Inputs and forms
- [ ] All inputs use `<UInput>`, `<UTextarea>`, `<USelectMenu>`, `<UCheckbox>` from Nuxt UI
- [ ] Form fields wrapped in `<UFormField>` for consistent label/help/error rendering
- [ ] Required fields marked with `*` in `text-error`, not via custom asterisk styling
- [ ] No bare `<input>` or `<textarea>` elements

### Lists and rows
- [ ] List separators use `border-b border-muted` or `divide-y divide-muted` — not custom dividers
- [ ] Row hover states use `hover:bg-muted` or `hover:bg-accented`, not custom hover backgrounds
- [ ] Row click targets meet 44px minimum effective height
- [ ] List items use `<li>` inside `<ul>`, not `<div>` stacks (semantic HTML)

### Tags and badges
- [ ] All tags/badges/chips use `<UBadge>` from Nuxt UI
- [ ] Badge color matches the documented mapping in DESIGN.md §Components §Tags and chips
  - verified → `color="success" variant="subtle"`
  - draft → `color="warning" variant="subtle"`
  - inbox → `color="info" variant="subtle"`
  - archived → `color="neutral" variant="outline"`
  - priority high/urgent → `color="error"`
- [ ] No custom badge components

### Icons
- [ ] All icons via Nuxt UI's icon prop or `<UIcon>` — no inline SVG or `<img>` for icons
- [ ] Icons use Lucide (`i-lucide-*`) by default; Heroicons only for special filled-glyph moments
- [ ] Icon sizes consistent: `size-4` (16px) inline with body, `size-5` (20px) for nav/buttons, `size-6` (24px) for headers

### Modals and overlays
- [ ] All modals use `<UModal>` from Nuxt UI
- [ ] Light-mode pockets (Vault unlock, master-password, settings, audit views) wrapped in `<div class="light">`
- [ ] No custom backdrop or close-button implementations

### i18n
- [ ] No hardcoded user-facing strings — all visible text uses `$t('...')` or `t('...')`
- [ ] Translation keys follow the feature-prefixed dot path convention (`kb.inbox.title`, `vault.unlock.button`)

### Component primitives
- [ ] Pages use `<UPageHeader>` (or the project's PageHeader wrapper) for consistent page headers
- [ ] No hand-rolled wrappers around Nuxt UI components without justification

### Accessibility (light pass)
- [ ] Interactive elements have appropriate `aria-*` attributes or use Nuxt UI components that handle them
- [ ] Buttons that are icon-only have `aria-label` or use UButton's `:label` for screen readers
- [ ] Color is not the only indicator (e.g. status badges have text labels, not just color)

## Output

Write the report to `docs/design-audits/{filename-or-folder-slug}-{YYYY-MM-DD}.md` with this structure:

```
# Design Audit — <subject> — <date>

## Summary
- Files scanned: N
- Critical: N | Major: N | Minor: N
- Estimated effort: S (<1h) | M (1-3h) | L (>3h)
- Headline issues (top 3 things to fix first):
  1. ...
  2. ...
  3. ...

## Findings by file

### app/pages/app/kb/index.vue
- **critical** — line 42: hardcoded `bg-zinc-900` in card container. Fix: use `bg-elevated`.
- **major** — line 17: number rendered without `font-mono`. Fix: wrap in `<span class="font-mono">{count}</span>`.
- **major** — line 78: card uses `rounded-2xl`. Fix: switch to `rounded-xl` per DESIGN.md radius scale.
- **minor** — line 91: chevron icon at `size-4`, should be `size-5` to match other right-edge affordances in lists.
- ...

### app/pages/app/kb/[slug].vue
- ...

## Recommended fix order

Group by complexity, easiest wins first:

1. Replace hardcoded color utilities with semantic ones (mechanical, find-and-replace level)
2. Standardise card patterns (`bg-elevated rounded-xl border border-default`)
3. Apply `font-mono` to all number/ID/date renderings
4. Normalise spacing per view
5. Restructure components that hand-rolled what Nuxt UI provides

## DESIGN.md gaps surfaced

If during the audit you noticed needs that DESIGN.md doesn't cover, list them here as questions:
- ...
```
