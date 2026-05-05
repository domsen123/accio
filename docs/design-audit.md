# Design Audit

Frontend `app/` vs `DESIGN.md`. Scope: components only. Token layer (`main.css`, `app.config.ts`) verified compliant with Nuxt UI v4 schema (`ui.colors.{primary,secondary,success,info,warning,error,neutral}`).

Fix recipes use idiomatic Nuxt UI v4 (verified via context7 `/websites/ui_nuxt`):
- Light-mode pockets for destructive/credential dialogs → wrap in `<div class="light">` or use a light-mode `<UModal>`. Pages themselves inherit the user's color mode.
- Buttons → `<UButton color variant size>` with semantic slots; never override bg via class.
- Page headers → `<UPageHeader :title :description :headline :links>` (links accept `ButtonProps[]`, default `{ color: 'neutral', variant: 'outline' }`).
- Tab nav → `<UTabs>` or `<UNavigationMenu>` (not raw `<button>`).
- Color overrides → only via `app.config.ts` `ui.<component>.slots` or `:ui` prop, never `dark:` classes inline.

Severity:
- **critical** — visible brand/theme break, banned construct, or missing mandated layout behavior.
- **major** — pattern violation that drifts from system but renders ok.
- **minor** — local cleanup, low blast radius.

---

## Critical

### ConfirmationCard wrong color scheme
DESIGN §Components §Confirmation cards: default container = `bg-elevated border border-default rounded-lg p-4`. Only `vault_get_secret` gets `border-error` + warning band (`bg-error/10 border border-error rounded-md p-3`).
- `app/features/orchestrator/components/ConfirmationCard.vue` — uses `bg-warning/5 ring-warning/30` for all confirmations; no `vault_get_secret` branch.

**Fix:** swap the wrapper to a `<UCard>` with `:ui="{ root: 'bg-elevated border-default' }"` (or plain `<div class="bg-elevated border border-default rounded-lg p-4">`). Branch on tool name; for `vault_get_secret`, override `:ui="{ root: 'bg-elevated border-error' }"` and prepend `<UAlert color="error" variant="soft" :title="...">` inside the card body. Action row uses `<UButton color="primary" size="sm">` + `<UButton variant="ghost" color="neutral" size="sm">`.

### Gradient backgrounds (banned)
DESIGN §Don't: flat blocks only.
- `app/pages/admin/media/index.vue:124` — `bg-gradient-to-t from-black/70 to-transparent`
- `app/features/admin/components/AdminMediaPickerModal.vue:203` — same overlay

**Fix:** replace overlay with `bg-inverted/70` solid (or remove and float caption below thumbnail). Caption uses `text-inverted text-xs font-medium` so light mode flips correctly.

### Drop shadows for elevation (banned)
DESIGN §Don't: cards rise via `bg-elevated`, not `shadow-*`.
- `app/pages/app/settings/index.vue:83` — `hover:shadow-md`
- `app/features/admin/components/AdminMediaFocusPicker.vue:40` — `shadow-lg`

**Fix:** swap hover state to `hover:bg-accented transition-colors`. For focus/selection, use `ring-2 ring-primary` (Nuxt UI convention, see `UButton` `focus-visible` recipe).

### Banned tailwind shades / raw colors
DESIGN §Tokens: never `bg-zinc-*`, `text-white`, `text-gray-*`. Use semantic utilities (`text-default`, `text-muted`, `text-dimmed`, `text-inverted`, `text-toned`, `text-highlighted`) which resolve through `--ui-text-*` vars and auto-flip per mode.

| File:line | Current | Replace with |
|---|---|---|
| `app/pages/auth/forgot-password.vue:114` | `text-gray-600 dark:text-gray-400` | `text-muted` |
| `app/pages/auth/forgot-password.vue:117` | `text-gray-500 dark:text-gray-500` | `text-dimmed` |
| `app/pages/admin/media/index.vue:125` | `text-white` (overlay label) | `text-inverted` |
| `app/pages/admin/media/index.vue:128` | `text-white/70` | `text-inverted/70` |
| `app/features/admin/components/AdminUserAvatar.vue:157,158,166` | `text-white` (hover overlay) | `text-inverted` |
| `app/features/admin/components/AdminMediaPickerModal.vue:197,205,208` | `text-white` / `text-white/70` | `text-inverted` / `text-inverted/70` |

### `dark:` variants in components (banned)
DESIGN §Don't: no color-mode classes outside `.light`/`.dark` wrappers; Nuxt UI semantic vars already mode-aware.
- `app/components/AppResponsiveMenu.vue:89,100` — `dark:bg-elevated` in UI prop. Drop `dark:`; `bg-elevated` is correct in both modes.
- `app/features/admin/components/AdminAvatarCropperModal.vue:56` — `dark:bg-white/5`. Replace with `bg-accented` (resolves to `#2b3139` dark / neutral-200 light).
- `app/pages/auth/forgot-password.vue:114,117` — covered above.

---

## Major

### Numbers without `font-mono`
DESIGN §Typography: every count/date/ID/duration is `font-mono`. Spot checks:
- `app/features/todo/components/TodoSubNav.vue:65` — `{{ tab.count }}` plain
- `app/pages/admin/media/index.vue:147` — `{{ rangeStart }}-{{ rangeEnd }}` plain
- `app/pages/admin/media/index.vue:48` — page-size options plain

**Fix recipe:** wrap count in `<span class="font-mono">{{ n }}</span>` or use `<UBadge color="neutral" variant="subtle" :ui="{ base: 'font-mono' }">`. For badge counts on `<UTabs>` / `<UNavigationMenu>`, set globally in `app.config.ts`:
```ts
ui: { badge: { slots: { base: 'font-mono' } } }
```
Recommend repo-wide sweep grouped per feature slice (`pages/app/**`, `features/orchestrator`, `features/projects`, `features/kb`, `features/todo`).

### Raw `<button>` instead of Nuxt UI components
DESIGN §Components §Buttons: `<UButton>` for actions; `<UTabs>` / `<UNavigationMenu>` for tab nav.

| File:line | Current | Replace with |
|---|---|---|
| `app/features/todo/components/TodoSubNav.vue:46` | tab `<button>` row | `<UNavigationMenu :items="tabs" orientation="horizontal" highlight />` (each item gets `label`, `icon`, `to`, `badge: { label: tab.count, ui: { base: 'font-mono' } }`) |
| `app/features/kb/components/KbCategoryTree.vue:312,346,365` | tree node toggles | `<UButton variant="ghost" color="neutral" size="xs" square :icon="...">` |
| `app/features/orchestrator/components/ToolResultCard.vue:78` | toggle | `<UButton variant="ghost" color="neutral" size="xs">` |
| `app/features/orchestrator/components/ToolCallCard.vue:58` | toggle | same |
| `app/features/admin/components/AdminBlogPostForm.vue:294` | form button | `<UButton variant="ghost">` |
| `app/features/admin/components/AdminOrganisationForm.vue:177` | form button | same |
| `app/features/admin/components/AdminTeamMemberAddModal.vue:68` | modal button | `<UButton>` |
| `app/features/admin/components/AdminMediaPickerModal.vue:176` | modal button | `<UButton>` |
| `app/components/AppResponsiveMenu.vue:105` | menu trigger | `<UButton variant="ghost">` (or `UDropdownMenu` trigger slot) |
| `app/pages/auth/forgot-password.vue:119` | inline action | `<UButton variant="link" color="primary">` |
| `app/pages/admin/media/index.vue:111` | grid card picker | `<UCard as="button" :ui="{ root: 'hover:bg-accented cursor-pointer transition-colors' }">` |

### `AppPageHeader.vue` thin
DESIGN §Layout patterns §Page-header pattern. `UPageHeader` already exposes `title` / `description` / `headline` / `links` (ButtonProps[]) + slots — wrapper currently doesn't enforce DESIGN's required `border-b border-default mb-6`.

**Fix:**
```vue
<UPageHeader
  :title :description :headline :links
  :ui="{ root: 'border-b border-default pb-4 mb-6' }"
>
  <template v-if="$slots.links" #links><slot name="links" /></template>
</UPageHeader>
```
Then sweep `pages/app/**` ad-hoc headers onto `<AppPageHeader>` so the bottom-border + spacing is uniform.

---

## Minor

### Hex in SVG / CSS fallback / meta
- `app/components/AppLogo.vue:11` — `#10b981` literal. Use `currentColor` so logo inherits parent text color, or `fill="var(--ui-color-success-500)"` if green is intentional.
- `app/features/kb/components/KbMarkdownPreview.vue:83,89,98` — `#6366f1`, `#6b7280` as `var()` fallbacks. Pull from `--ui-color-info-500` / `--ui-text-muted`.
- `app/app.vue:4` — `#020618` + `white` in `<meta name="theme-color">`. Should be `#0b0e11` (canvas-dark) / `#ffffff` (canvas-light) per `main.css`.

### Inline px math
- `app/features/kb/components/KbCategoryTree.vue:343` — `paddingLeft: '${node.depth * 12 + 4}px'`. Use `--indent` CSS var on the row (`style="--indent: ${depth}"` + class `pl-[calc(theme(spacing.1)+var(--indent)*theme(spacing.3))]`) or precompute Tailwind class via map.

---

## Compliant (verified)

- `app/layouts/app.vue` — top-nav 64px, side-nav 240px → icons → drawer, `bg-default`. Matches DESIGN §App shell. Built on `UDashboardNavbar` / `UDashboardSidebar` correctly.
- `app/components/AppHeader.vue` — public marketing header, not app shell. Uses `UHeader` correctly.
- Token layer (`main.css` + `app.config.ts`) — `accio-yellow` palette, semantic slots, `:root` light + `.dark` + `.light`-pocket overrides all match DESIGN §Tokens. App config uses v4 nested `ui.colors` shape.

---

## Recommended fix order

1. ConfirmationCard rewrite (orchestrator core; missing `vault_get_secret` `border-error` variant = security UX gap).
2. Token-purge sweep: `text-white` / `text-gray-*` / `dark:*` / gradients / shadows → semantic utilities. One PR per file cluster.
3. `font-mono` sweep per feature slice; consider `app.config.ts` global `badge.slots.base = 'font-mono'`.
4. `<button>` → `<UButton>` / `<UNavigationMenu>` / `<UTabs>` migration (TodoSubNav highest impact).
5. Strengthen `AppPageHeader.vue` to enforce `border-b mb-6` via `:ui` prop; migrate ad-hoc page headers.
6. Logo + `KbMarkdownPreview` + `app.vue` meta hex cleanup.
