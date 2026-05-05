# Design System

Visual and UX system for Accio. Source of truth for all UI work. Nuxt UI 4 is the implementation layer; this document is what it implements.

## Reading order

If you're an AI agent or a new contributor:
1. Read **Overview** for the vibe.
2. Read **Architecture** to understand where tokens live in code.
3. Read **Tokens** before writing any styles.
4. Read **Components** before composing any UI — many patterns already exist.
5. Read **Do's and Don'ts** before deviating from anything above.

If something isn't in this document, it is not implemented. New components or tokens require updating this document **before** writing the code.

---

## Overview

Accio reads like a focused workspace tool that feels both authoritative and energetic. The base atmosphere is a **deep near-black canvas** holding off-white type and a single, ubiquitous accent: **a saturated yellow** that does almost all of the brand's heavy lifting — every primary CTA, every brand mark, every value-claim moment. There is no secondary brand color. The system trusts the yellow voltage to do the brand work alone.

Type runs **Inter** (display + body) and **JetBrains Mono** (numerical / tabular data, identifiers). Inter carries headlines, body, button labels. JetBrains Mono appears on counts, dates, durations, key fingerprints, file sizes, code snippets — anywhere a number, identifier, or technical string wants to feel "tabular and reliable." Display weights are heavier than typical marketing systems (600–700) because the app surfaces dense data and headlines need to compete.

The product is **multi-theme**:
- **Dark theme** is default for the app shell — Knowledge Base, Todos, Projects, Orchestrator, Settings, Audit. Anywhere you read, scan, configure, or work with data, the user's chosen mode applies.
- **Light theme** is used for **transactional / decision moments** rendered as pockets *inside* the shell — Vault unlock dialog, master-password setup, destructive-action confirmation modals, credential reveal prompts. The page behind stays in the user's mode; only the dialog flips.

The same yellow CTAs and the same semantic green/red thread through both themes — only canvas, surface, and text tones flip.

### Key characteristics

- **Single accent color**: `primary` does all brand voltage — primary CTAs, hero accents, brand mark. Used scarcely on dark for emphasis, ubiquitously on transactional dialogs.
- **Type stack**: Inter for editorial type, JetBrains Mono for numbers, identifiers and code. Mixing the two is functional, not decorative.
- **Multi-theme**: dark for app workspace surfaces, light for transactional dialogs. Driven by Nuxt UI's color-mode plus per-route layout choice.
- **Card surfaces**: a one-step-elevated dark for cards on dark canvas; pure white cards on light canvas. **No gradient surfaces, no atmospheric backdrops** — flat color blocks throughout.
- **Border radius is tight**: base radius 0.375rem (6px). We do not blanket everything in `rounded-2xl`.
- **Hairlines, not shadows**: depth comes from 1px borders and surface-to-canvas contrast, not drop shadows.
- **Spacing on a 4px grid**, with major editorial bands at 80px.

---

## Architecture

Three files own the design system in code. Anywhere else in the codebase, you consume tokens via Tailwind classes and Nuxt UI props.

| File | Purpose |
|---|---|
| `app/assets/css/main.css` | The single source of truth for raw values. Defines color scales (50–950), fonts, breakpoints via `@theme`. Defines Nuxt UI's CSS-variable overrides (which shade maps to `--ui-primary` per mode, which background tone, which border, the global `--ui-radius`, etc.). |
| `app/app.config.ts` | Semantic color mapping only. Tells Nuxt UI which palette is `primary`, which is `neutral`, etc. Runtime-configurable. |
| `nuxt.config.ts` | Adds extra semantic slots beyond Nuxt UI's defaults if we need them. We do **not** use this currently — the standard slots cover us. |

**Important rule:** component code never hardcodes a hex value, never sets a color shade directly. It uses Nuxt UI props (`color="primary"`, `variant="solid"`, `size="md"`) and Tailwind utility classes that already resolve through the variables (`bg-default`, `text-muted`, `border-accented`, `rounded-md`).

If a value isn't expressible through these, the token is missing — update this document and the three files above; do not patch components.

---

## Tokens

### Colors — semantic slots

Nuxt UI's standard semantic slots cover everything we need. We map each to a concrete palette in `app/app.config.ts`:

| Slot | Palette | Used for |
|---|---|---|
| `primary` | `accio-yellow` (custom — see scale below) | Primary CTAs, brand mark, focal headlines, inline links, focus rings on dark |
| `secondary` | `sky` | Reserved. Currently unused; available if we later need a non-brand emphasis color (e.g. info-style chips). Avoid using it without updating this doc first. |
| `success` | `emerald` | Verified KB entries, completed todos, vault-unlocked indicators |
| `info` | `sky` | Informational badges, neutral notifications |
| `warning` | `amber` | Pending states, draft KB entries, almost-due todos, expiring sessions |
| `error` | `rose` | Validation errors, destructive actions, locked-vault prompt, overdue todos |
| `neutral` | `zinc` | Text, surfaces, borders, dividers — every non-accent surface |

#### The `accio-yellow` custom palette

Defined in `app/assets/css/main.css` via `@theme static`:

| Shade | Hex | Notes |
|---|---|---|
| 50 | #fffbe6 | Lightest tint. Reserved for soft yellow-on-light highlights. |
| 100 | #fff4b8 | |
| 200 | #ffe98a | |
| 300 | #ffde5c | |
| 400 | #fcd535 | **Brand base.** Default `primary` in dark mode (`--ui-primary` resolves here). |
| 500 | #f0b90b | Hover/active for primary CTAs in dark mode. Default `primary` shade in light mode. |
| 600 | #d4a009 | Hover/active for primary CTAs in light mode. |
| 700 | #a07807 | |
| 800 | #6e5305 | |
| 900 | #3a3a1f | Disabled state of primary CTAs on dark canvas (desaturated). |
| 950 | #1f1f0d | Reserved. |

The 400-as-base choice (rather than 500) is deliberate: Nuxt UI's defaults assume a 500-base, but Binance Yellow at #FCD535 has a perceived brightness that fits the 400 slot better against the deep canvas. Light mode uses 500 as default to compensate for the brighter background.

### Colors — Nuxt UI CSS variable overrides

In `app/assets/css/main.css`, after `@import "@nuxt/ui";`, we override the defaults:

```css
:root {
  /* Light mode (transactional surfaces) */
  --ui-primary: var(--ui-color-primary-500);                /* #f0b90b */
  --ui-bg: #ffffff;                                          /* canvas-light */
  --ui-bg-muted: #fafafa;                                    /* surface-soft-light */
  --ui-bg-elevated: #f5f5f5;                                 /* surface-strong-light */
  --ui-bg-accented: var(--ui-color-neutral-200);
  --ui-border: #eaecef;                                      /* hairline-on-light */
  --ui-border-muted: #eaecef;
  --ui-border-accented: var(--ui-color-neutral-300);
  --ui-text: #181a20;                                        /* ink */
  --ui-text-muted: #707a8a;                                  /* muted */
  --ui-text-dimmed: #929aa5;                                 /* muted-strong */
  --ui-text-highlighted: #181a20;
  --ui-radius: 0.375rem;                                     /* 6px base */
  --ui-container: var(--container-7xl);                      /* ~1280px */
}

.dark {
  /* Dark mode (app workspace surfaces) */
  --ui-primary: var(--ui-color-primary-400);                 /* #fcd535 */
  --ui-bg: #0b0e11;                                          /* canvas-dark */
  --ui-bg-muted: #1e2329;                                    /* surface-card-dark */
  --ui-bg-elevated: #1e2329;                                 /* same — used for cards */
  --ui-bg-accented: #2b3139;                                 /* surface-elevated-dark */
  --ui-border: #2b3139;                                      /* hairline-on-dark */
  --ui-border-muted: #1e2329;
  --ui-border-accented: #2b3139;
  --ui-text: #eaecef;                                        /* body */
  --ui-text-muted: #707a8a;
  --ui-text-dimmed: #929aa5;
  --ui-text-highlighted: #ffffff;
}
```

### Background and text utility classes

Always prefer Nuxt UI's semantic utilities over hex or shade-specific classes:

| Class | Use |
|---|---|
| `bg-default` | Canvas — page floor |
| `bg-muted` | One step elevated — softly distinct from canvas |
| `bg-elevated` | Cards, dropdowns, popovers |
| `bg-accented` | Hovered nav items, nested cards inside cards |
| `bg-inverted` | Inverted background (rare; tooltips, photo overlays) |
| `text-default` | Body text |
| `text-muted` | Captions, table column headers, footer links |
| `text-dimmed` | Even softer — meta labels, timestamps |
| `text-toned` | One step warmer than muted — used in dark mode for slightly emphasized labels |
| `text-highlighted` | High-contrast headlines |
| `text-inverted` | Text on inverted backgrounds |
| `border-default` | Standard 1px hairline |
| `border-muted` | Softer divider — table rows, list separators |
| `border-accented` | Stronger emphasis, e.g. focused inputs |

These classes resolve through CSS variables and automatically adapt to light/dark. **Do not use** `bg-zinc-900`, `text-white`, `border-gray-200` etc. directly in components.

### Typography

#### Font families (set in `main.css` via `@theme`)

```css
@theme {
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
}
```

Both fonts are loaded via `@nuxtjs/fonts` (the starter already has the integration).

#### Hierarchy

Use Tailwind's standard `text-*` utilities; the values below are what they resolve to with Inter loaded. The `font-mono` utility switches to JetBrains Mono for any element rendering numbers, IDs, code, or technical strings.

| Role | Class | Size | Weight | Line-height | Notes |
|---|---|---|---|---|---|
| Hero display | `text-6xl font-bold tracking-tight` | 64px | 700 | 1.1 | Reserved for marketing landing if/when we add it |
| Display lg | `text-5xl font-bold tracking-tight` | 48px | 700 | 1.1 | Largest in-app headline (e.g. dashboard greeting, brand pages) |
| Display md | `text-4xl font-semibold tracking-tight` | 40px | 600 | 1.15 | Section heads on long-scroll pages |
| Display sm | `text-3xl font-semibold` | 32px | 600 | 1.2 | CTA band headlines, page titles on top of `/app` pages |
| Title lg | `text-2xl font-semibold` | 24px | 600 | 1.3 | Sub-section titles, KB entry titles |
| Title md | `text-xl font-semibold` | 20px | 600 | 1.35 | Card titles, modal titles |
| Title sm | `text-base font-semibold` | 16px | 600 | 1.4 | Side-nav headers, FAQ rows, badge labels |
| Body md | `text-sm` | 14px | 400 | 1.5 | **Default body text.** App-wide running text. |
| Body sm | `text-[13px]` | 13px | 400 | 1.5 | Cookie/consent text, footer body |
| Caption | `text-xs font-medium` | 12px | 500 | 1.4 | Small meta labels, timestamps |
| Button | `text-sm font-semibold` | 14px | 600 | 1 | CTA button labels (Nuxt UI buttons handle this internally) |
| Number display | `text-4xl font-bold tracking-tight font-mono` | 40px | 700 | 1.1 | Big stat numbers (KB count, todo count) — **always font-mono** |
| Number md | `text-sm font-medium font-mono` | 14px | 500 | 1.4 | Inline numbers, table cells with counts/dates — **font-mono** |
| Number sm | `text-xs font-medium font-mono` | 12px | 500 | 1.4 | Inline counts in chips, badges — **font-mono** |
| Code | `text-sm font-mono` | 14px | 400 | 1.5 | Inline code snippets, key fingerprints, identifiers |

#### Principles

- Display sizes use weight 700 — heavier than most marketing systems. App surfaces compete with dense data; thin display weights look soft and out of place.
- Numbers, IDs, dates, durations, file sizes, key fingerprints, code: **always `font-mono`**. Even when surrounded by Inter body text. This is the system's "trustworthy data" voice.
- Body text defaults to 14px. We do not scale up to 16px the way airy marketing sites do — Accio is dense by design.

### Spacing

Tailwind's default spacing scale on a 4px grid. Tokens we lean on:

| Class | Value | Used for |
|---|---|---|
| `space-1` / `gap-1` | 4px | Tight icon-text gaps |
| `space-2` / `gap-2` | 8px | Inline chip gaps |
| `space-3` / `gap-3` | 12px | Form-field row spacing |
| `space-4` / `gap-4` | 16px | Card internal padding (small), table row vertical padding |
| `space-6` / `gap-6` | 24px | Card internal padding (default), grid gutters |
| `space-8` / `gap-8` | 32px | Card internal padding (large), elevated CTA bands |
| `space-12` / `gap-12` | 48px | Inter-section breathing on dense pages |
| `space-20` / `py-20` | 80px | **Major editorial section** padding (hero, CTA bands, footers) |

For component padding, prefer Nuxt UI's `size` prop (`xs|sm|md|lg|xl`) which already resolves to consistent spacing. Inline custom spacing only when the component doesn't expose what you need.

### Border radius

A single base value drives every `rounded-*` utility:

```css
:root { --ui-radius: 0.375rem; }  /* 6px — set in main.css */
```

This makes `rounded-md` resolve to 6px, `rounded-lg` to 8px, `rounded-xl` to 12px, etc., consistently across all Nuxt UI components.

| Class | Resolved | Use |
|---|---|---|
| `rounded-xs` | 2px | Almost no use |
| `rounded-sm` | 4px | Small inline pills, tag chips |
| `rounded-md` | 6px | **Default** — buttons, inputs, small cards |
| `rounded-lg` | 8px | Content cards, elevated panels, modals |
| `rounded-xl` | 12px | Large cards, hero containers, marketing bands |
| `rounded-2xl` | 16px | Reserved for brand/marketing surfaces only |
| `rounded-full` | 9999px | Avatars, coin/icon backgrounds, the most prominent "Sign Up"-style pill CTAs |

We do **not** override individual radius values in component code. If a component needs a specific radius outside this scale, the design needs revisiting.

### Breakpoints

Tailwind defaults (via `@theme`):

| Name | Min width | Treatment |
|---|---|---|
| `sm` | 640px | Phones in landscape |
| `md` | 768px | Tablet portrait. Side-nav can begin to show. |
| `lg` | 1024px | Tablet landscape / small laptop. Full app shell visible. |
| `xl` | 1280px | Desktop. Default content target. |
| `2xl` | 1536px | Wide desktop. Container caps; outer breathing. |

Mobile (< 640px) collapses the side-nav to a sheet drawer. The top-nav lock indicator and workspace switcher stay visible.

### Container

```css
:root { --ui-container: var(--container-7xl); }  /* ~1280px */
```

`<UContainer>` should be used for editorial / hero content. Dense pages (KB list, todos table) can opt for full-bleed within the app shell, with internal padding via the layout.

---

## Iconography

- All icons via Nuxt UI's icon integration. We pin to **Lucide** (`i-lucide-*`) as the default set for editorial UI (nav, buttons, inline cues).
- For brand/special moments, **Heroicons solid** (`i-heroicons-solid-*`) is allowed as a secondary set — but only when the visual weight specifically calls for filled glyphs.
- Avatar / coin-style identifiers (e.g. for connected GitHub repos) use a circular crop at 32×32 or 24×24, with a 1px `border-default` ring on dark canvas to prevent edge bleed.
- Icon size defaults: `size-4` (16px) inline with body text, `size-5` (20px) for nav and button leading icons, `size-6` (24px) for card headers and standalone affordances.

---

## Layout patterns

### App shell (under `/app/**`)

A new `app/layouts/app.vue` wraps every `/app/**` page. Composition:

- **Top nav** — fixed, 64px tall, `bg-default border-b border-default`. Contains: brand mark (left), workspace switcher, global search input, language toggle, vault lock indicator, user menu (right).
- **Side nav** — fixed left, 240px wide on `lg+`, collapses to icons-only at `md`, becomes a sheet drawer below `md`. `bg-muted border-r border-default`. Contains: KB, Todos, Projects, Orchestrator, Vault, Settings — each with a Lucide icon and a label.
- **Main content** — fills remaining space. `bg-default`. Internal padding `p-6` on `lg+`, `p-4` on smaller. Each page is responsible for its own page header.

The app shell is **dark by default**.

### Transactional dialogs (light-mode pockets inside the dark shell)

The Vault unlock modal, master-password setup, and destructive confirmation dialogs render as light-themed modals **even when the surrounding shell is dark**. Implement by wrapping the modal content in `<div class="light">` (or by setting Nuxt UI's `color-mode` locally for the modal). The trick: only the modal flips, not the page behind it. The page stays dark; the modal becomes a bright "decision pocket".

This is a deliberate UX choice — bright surfaces signal "stop, decide" while dark surfaces signal "browse, work."

### Settings pages (theme inherits)

Pages under `/app/settings/**` inherit the user's active color mode (the global app shell choice). They do **not** force light. Decision-heavy *moments* inside settings — destructive confirmations, master-password change, vault reset, credentials reveal — still render as light-mode pockets via the modal/dialog pattern above. The page chrome itself stays in whatever mode the user picked.

Rationale: forcing a per-route theme flip mid-session jars users who deliberately picked dark mode; the decision-pocket pattern already isolates the "stop, decide" surfaces where it actually matters.

Implementation: do **not** set `definePageMeta({ colorMode: 'light' })` on settings pages. Wrap individual destructive/credential dialogs in `<div class="light">` (or a light-mode `<UModal>`) per the pocket pattern.

### Page-header pattern

Every `/app` page is composed as a nested `UPage` with a `UPageHeader` at the top. The reference implementation is `app/pages/app/kb/index.vue`.

**Structure:**

```vue
<template>
  <UPage>
    <UPageHeader
      :title="t('feature.title')"
      :description="t('feature.subtitle')"
      :links="[…]"
      :ui="{ root: 'border-none' }"
    >
      <template #headline>
        <UBreadcrumb :items="breadcrumbItems" />
      </template>
      <!-- optional sub-nav slot content here -->
    </UPageHeader>

    <UPage>
      <!-- page body -->
    </UPage>
  </UPage>
</template>
```

**Rules:**

- **Title + description on `UPageHeader` props.** Never re-render an `<h1>`/`<p>` block inside the body when `UPageHeader` already accepts `:title` / `:description`.
- **Primary actions go on `UPageHeader`:** simple action buttons via the `:links` array prop; complex/conditional buttons via the `#links` slot.
- **Breadcrumb in `#headline` slot.** Build a `BreadcrumbItem[]` from `@nuxt/ui` reflecting the route hierarchy:
  - All ancestors carry a `to` link.
  - The last item is the current page — no `to` (it is not a link).
  - Labels via `i18n` (`t('…')`) — never hardcoded strings.
  - Dynamic segments (`[slug]`, `[id]`) use the loaded resource's title/name, not the raw param. Provide a sensible fallback while loading.
- **No "Back" buttons.** Don't render a leading `i-lucide-arrow-left` button, a `Zurück`/`Back` link, or `router.back()` triggers anywhere under `/app/**`. The breadcrumb is the navigation affordance.
- **Sub-navigation** (e.g. `KbSubNav`, `TodoSubNav`) renders as default-slot content inside `UPageHeader`, typically wrapped in `<div class="mt-4">`.
- **Body density:** body content lives inside the inner `<UPage>`. When the page needs sub-areas use `#left` / `#right` slots; otherwise wrap content in `<div class="space-y-6">` (or the spacing the layout calls for) plus an optional `max-w-*` width cap.
- **Detail pages:** the `UPageHeader` `:title` is the resource's title (e.g. KB entry title, repo full name); breadcrumb shows the parent list. Edit / delete / "open in github" actions live in `#links`.

### Content density

- **List/table views** (todos, vault entries, simple uniform rows): row-based, 12px vertical padding per row, `border-b border-muted` between rows. Hairlines do the separation. **Exception:** lists with variable-length metadata (KB entries — multiple badges, category, tags, author meta) use the card-per-row pattern documented in §Components §Lists.
- **Detail views** (single KB entry, single todo): max content width `max-w-3xl` for readability, generous internal padding (`p-6` to `p-8`).
- **Dashboard / overview**: card grid, `gap-6`, cards use `bg-elevated rounded-lg border border-default p-6`.

---

## Components

These are the patterns we compose with. Each maps to either a Nuxt UI component (use it directly) or a small wrapper we build (build once, reuse). When building a new feature, **start by checking this list** — most needs are covered.

### Buttons

Use `<UButton>` from Nuxt UI with these conventions:

| Pattern | Props | Use |
|---|---|---|
| Primary CTA | `color="primary" variant="solid"` | The single most important action on a screen. **At most one per page section.** Yellow background, black text — the brand's iconic combination. |
| Pill primary | `color="primary" variant="solid" class="rounded-full"` | Reserved for top-of-page "Sign Up"-style moments and major launch CTAs. Use very sparingly. |
| Secondary on dark | `color="neutral" variant="subtle"` | Less-emphasized actions on dark canvas. Renders as a soft neutral fill. |
| Secondary on light | `color="neutral" variant="outline"` | Less-emphasized actions on light canvas. 1px `border-default` outline. |
| Tertiary text | `color="neutral" variant="ghost"` | Inline text actions ("Cancel", "Read more"). No background. |
| Link | `<UButton variant="link" color="primary">` | Inline link in copy. Yellow text, no underline by default; underline on hover. |
| Destructive | `color="error" variant="solid"` for confirmation; `color="error" variant="ghost"` for entry-points | Destructive CTAs (Delete, Reset Vault, Permanent Delete). Always paired with an explicit confirmation step. |
| Success | `color="success" variant="solid"` | Reserved for affirmative confirmations ("Verify entry", "Mark done"). Used sparingly. |

Sizes: `size="sm"` for inline / table-row actions; `size="md"` (default) for page-level CTAs; `size="lg"` for marketing hero or empty-state primary action.

**Never** override a button's background color via class. Always use the `color` and `variant` props.

### Inputs

Use `<UInput>`, `<UTextarea>`, `<USelectMenu>`, `<UCheckbox>`, etc.

- Default size `md`, height 40px.
- Label above the input (not floating). Implement via `<UFormField label="…">` wrapper.
- Required fields marked with a small `*` in `text-error` next to the label.
- Help text below the input via `<UFormField help="…">`, in `text-dimmed text-xs`.
- Error state: `<UFormField error="…">` — Nuxt UI handles the visual treatment.

### Cards

A "card" in Accio is `bg-elevated rounded-lg border border-default p-6`. Use `<UCard>` when you need slot-based structure; otherwise compose a `<div>` directly.

| Pattern | Usage |
|---|---|
| Content card | Default — body content with optional header and footer slots |
| Metric card | A single big number + label. Number uses `number-display` typography; label uses `text-muted text-sm`. |
| Action card | Card whose entire surface is clickable — for grid pickers (e.g. AI provider picker). Add `hover:bg-accented transition-colors cursor-pointer`. |
| Empty-state card | Centered icon + title + body + single primary CTA. Use only when a page is empty. Padding `py-12 px-6`. |

We do **not** use box-shadows on cards. Depth comes from the `bg-elevated` against `bg-default`.

### Lists (the dominant pattern)

Most app data is presented as lists, not cards. The pattern:

```
<ul class="divide-y divide-muted">
  <li class="py-3 px-4 hover:bg-muted transition-colors">
    {row content}
  </li>
</ul>
```

Or use `<UTable>` for tabular data with column headers.

Row content uses a `flex items-center gap-3` layout: icon/avatar (left), main text (flex-1), meta (right). Meta typically renders in `text-muted text-xs`.

#### Card-per-row exception (variable-metadata lists)

When list items carry **variable-length metadata** — multiple status badges, category chips, tag chips, multi-line author/source meta — flat hairline rows read as cluttered. In these cases, render each item as a card-per-row inside `<ul><li>`:

```
<ul class="space-y-3">
  <li v-for="entry in entries" :key="entry.id">
    <NuxtLink :to="..." class="block group">
      <UCard
        :ui="{
          root: 'bg-elevated transition-colors hover:bg-accented',
          body: 'p-4',
        }"
      >
        {row content}
      </UCard>
    </NuxtLink>
  </li>
</ul>
```

Rules:
- Surface is `bg-elevated` (the standard card surface) with `hover:bg-accented`.
- Padding `p-4` (denser than the default card `p-6` because rows still want list rhythm).
- Border-radius and border come from `<UCard>` defaults (`rounded-lg border border-default`). No `shadow-*`.
- Status semantics live on `<UBadge>` inside the card — **do not** tint the card surface with status colors (`bg-info/5`, `bg-warning/5`).
- Wrap in `<ul><li>` for list semantics; whole-card link via `<NuxtLink class="block">` — no nested `<button>`/`<UButton>` clickables inside the link (button-in-link is invalid HTML).
- Trailing chevron affordance is a non-interactive `<UIcon name="i-lucide-arrow-right" class="size-5 text-muted group-hover:text-default" />`, not a `<UButton>`.

Use this exception sparingly — KB entries (tags + category + author + status) is the canonical case. If row content is uniform (single title + single timestamp), stay with hairline rows.

### Modals

Use `<UModal>`. Content lives in a `bg-default` (or, for transactional intents, force light mode — see Layout patterns).

- Modal title: `title-md` (`text-xl font-semibold`).
- Modal body: standard typography rules.
- Modal footer: right-aligned button row, `gap-2`, primary action rightmost.
- Close `X` is provided by Nuxt UI; do not add a custom one.

Destructive modals (vault reset, permanent delete) get an extra `bg-error/10 border border-error rounded-md p-3` warning band at the top of the body explaining the consequence.

### Confirmation cards (orchestrator-specific)

A specific pattern in the Orchestrator chat: when the AI requests a write or reveal action, render a card inline in the chat:

- Container: `bg-elevated border border-default rounded-lg p-4`.
- Header: tool name in `font-mono text-xs text-muted` (e.g. `kb_create_entry`).
- Body: parameter summary, prose-style ("Will create entry titled 'X' in folder 'Y'…").
- Action row: `<UButton color="primary" size="sm">Confirm</UButton>` and `<UButton variant="ghost" size="sm">Cancel</UButton>`.

For `vault_get_secret` specifically: the container border is `border-error`, and a warning band at the top reads "The secret will be sent to the LLM provider. Confirm only if necessary." This is the single most cautious confirmation in the system.

### Tags and chips

Use `<UBadge>` from Nuxt UI:

| Pattern | Props |
|---|---|
| Tag (KB/Todo) | `color="neutral" variant="subtle"` |
| Status: verified | `color="success" variant="subtle"` |
| Status: draft | `color="warning" variant="subtle"` |
| Status: inbox | `color="info" variant="subtle"` |
| Status: archived | `color="neutral" variant="outline"` |
| Priority: urgent | `color="error" variant="solid"` |
| Priority: high | `color="error" variant="subtle"` |
| Priority: medium | `color="warning" variant="subtle"` |
| Priority: low | `color="neutral" variant="subtle"` |

### Vault lock indicator (top nav)

A custom small component: a Lucide `lock` (closed) or `lock-open` (open) icon, `size-5`, button-sized clickable area. State maps to `text-muted` (closed) or `text-success` (open). Click opens a popover with: lock-state label, time-until-auto-lock, "Lock now" button.

Visible only when the user has `vault:read`.

### Markdown rendering (KB body, Todo notes)

Use `@nuxtjs/mdc` or a similar Markdown renderer with the following overrides:

- Body text: standard typography rules.
- Headings inside Markdown: scale down by one step (a `#` H1 inside a KB body renders as `title-lg`, not `display-sm`, because the page already has its own h1).
- Code blocks: `font-mono text-sm bg-muted border border-default rounded-md p-4 overflow-x-auto`.
- Inline code: `font-mono text-sm bg-muted px-1.5 py-0.5 rounded-sm`.
- Wikilinks `[[slug]]`: render as `<UButton variant="link" color="primary">` with a small chain icon. Unresolved wikilinks render with `border-error` underline and a tooltip "Entry not found".

---

## Light-mode pockets — implementation

To force a region into light mode regardless of the active app theme, wrap it:

```vue
<div class="light">
  <!-- content here renders in light mode, even if the app is dark -->
</div>
```

This works because Nuxt UI's CSS variables key off the `.dark` class on a parent — so wrapping in a `.light` (or a parent without `.dark`) flips the whole subtree.

Apply to:
- Vault unlock modal
- Master-password setup
- Master-password change
- Vault reset confirmation
- Destructive confirmation modals on settings pages
- Audit log destructive actions (revoke session, delete log range)

Settings pages and audit log views themselves follow the user's active color mode — only the destructive/credential dialogs inside them flip to light.

The body text inside these pockets uses `text-default` and `bg-default` exactly as elsewhere; the variables resolve differently because the parent class flipped.

---

## Do's and Don'ts

### Do
- Reserve `primary` (yellow) for primary actions, brand-claim headlines, and the brand mark. Yellow's scarcity is what makes it powerful.
- Keep the primary CTA visually identical across light and dark modes — yellow background with dark text. Same on the Vault unlock modal as on the KB inbox.
- Use `font-mono` for **every** number, identifier, date, duration, file size, code snippet. Mixing Inter into a number ticker breaks the system's data voice.
- Choose theme by intent: dark for work-and-browse surfaces; light for decision-and-input surfaces.
- Anchor major editorial bands at `py-20` (80px). Accio is denser than airy marketing sites — 80px is the right rhythm.
- Use the Nuxt UI semantic utilities (`bg-default`, `text-muted`, `border-default`) — they auto-adapt to theme.
- Update this document **before** introducing a new component or token.

### Don't
- Don't introduce a second brand color. The system has exactly one accent (`primary`). If a feature seems to need one, it probably needs a different *variant* of an existing semantic instead.
- Don't use yellow for body text or large surface fills. It is for focal-point CTAs and headlines only.
- Don't hardcode hex values, Tailwind shade numbers (`bg-zinc-900`), or color-mode-specific classes (`dark:bg-zinc-900`) in components. Use the semantic variables.
- Don't soften display weight. `display-lg` and `display-md` are intentionally weight 700/600 — going to 400 reads as design-portfolio, not workspace tool.
- Don't add atmospheric gradients to canvases (mesh, aurora, glow effects). Accio trusts color-block contrast — atmospheric depth muddies the focused feel.
- Don't invert the primary CTA's text color. Black on yellow is the system's signature — white text on yellow loses contrast and brand recognition.
- Don't use drop shadows for elevation. Cards rise off the canvas via `bg-elevated`, not via `shadow-*`.
- Don't override radius per-component. The `--ui-radius` base value cascades; respect it.

---

## Responsive behavior

| Breakpoint | Behaviour |
|---|---|
| `< sm` (mobile) | Side-nav becomes a sheet drawer; top-nav keeps brand + workspace switcher + lock indicator + user menu only. Page padding `p-4`. List rows stay full-width; tables convert to stacked rows when columns exceed 3. |
| `sm`–`md` (small tablet) | Side-nav still hidden behind drawer toggle. Top-nav adds global search. |
| `md`–`lg` (large tablet) | Side-nav visible as icon-only (collapsed). Page padding `p-5`. |
| `lg`–`xl` (desktop) | Side-nav full-width with labels (240px). Page padding `p-6`. Tables show all columns. |
| `xl`–`2xl` (wide desktop) | Same as desktop with `<UContainer>` capping content at `~1280px` for editorial pages. Dense pages (KB list, todos) stay full-bleed within the shell. |
| `> 2xl` (ultrawide) | Side-nav stays at 240px; content area gains breathing room. No further layout changes. |

### Touch targets
- Buttons: minimum 40×40px (Nuxt UI default for `size="md"`).
- Inline icon buttons: minimum 32×32px.
- List rows: minimum 44px effective height (12px padding + 20px content).

### Image behaviour
- Avatars/icons stay at fixed sizes (16/20/24/32) regardless of breakpoint.
- KB images render at full content-column width with `rounded-lg`. They do not bleed out of the column.

---

## Implementation checklist (when adding a new page or component)

Use this list in PRs / before checking off a task:

- [ ] No hardcoded hex values in component code
- [ ] No `dark:` variant overrides in component code (except inside `.light` / `.dark` wrappers for pocket-mode)
- [ ] Uses `<UButton>`, `<UInput>`, `<UModal>` etc. from Nuxt UI where applicable, not hand-rolled equivalents
- [ ] Numbers, dates, IDs use `font-mono`
- [ ] Tags / status indicators use the semantic colors documented in §Components
- [ ] Page header follows the documented page-header pattern (`UPage` > `UPageHeader` with title/description props, breadcrumb in `#headline` slot, actions in `#links`)
- [ ] No back buttons / `router.back()` affordances — breadcrumb is the only up-nav
- [ ] Spacing uses Tailwind tokens, not inline pixels
- [ ] Touch targets meet minimum sizes
- [ ] Empty state defined (if applicable)
- [ ] Loading state defined (if applicable, via `<USkeleton>` or equivalent)
- [ ] Error state defined (if applicable)
- [ ] i18n keys exist for all visible strings (`vault.*`, `kb.*`, etc.)

---

## Known gaps

These are intentional non-decisions as of this version. If you hit them, raise a question rather than improvising:

- **Animation and motion** — not formalised. Default to Nuxt UI's built-in transitions; do not add custom animations without updating this doc.
- **Charts** — no specific chart styling has been defined yet. When charts land, define a charts section.
- **Drag-and-drop visuals** — folder reorder in the Vault and KB will need this; conventions to be added.
- **Print styles** — out of scope.
- **Marketing landing page styling** — when `/` gets built for SaaS, expand this doc with a marketing section.
