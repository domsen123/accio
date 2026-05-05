# DESIGN.md — Binance Design System (Nuxt UI)

This document defines the complete design system for this project, modelled after Binance's trading platform UI. All implementation uses **Nuxt UI v3** (Tailwind v4). Follow these rules precisely when building or modifying any UI component.

---

## 1. Design Philosophy

Binance's UI is built around three principles:

1. **Data density** — surfaces as much information as possible without feeling cluttered.
2. **Professional darkness** — dark-first, near-black backgrounds with sharp contrast.
3. **Precise action** — every interactive element is immediately identifiable; yellow signals the primary CTA, green = buy/positive, red = sell/negative.

---

## 2. File Structure

```
assets/
  css/
    main.css          ← Global tokens (colors, radius, font)
app.config.ts         ← Nuxt UI semantic color + component overrides
```

---

## 3. `assets/css/main.css`

```css
@import "tailwindcss";
@import "@nuxt/ui";

/* ── Font ─────────────────────────────────────────────── */
@theme {
  --font-sans: 'IBM Plex Sans', sans-serif;
}

/* ── Custom palettes ──────────────────────────────────── */
@theme static {

  /* Binance Yellow (primary) */
  --color-bnb-50:  #fffde7;
  --color-bnb-100: #fff9c4;
  --color-bnb-200: #fff59d;
  --color-bnb-300: #fff176;
  --color-bnb-400: #ffee58;
  --color-bnb-500: #F0B90B;
  --color-bnb-600: #d4a009;
  --color-bnb-700: #b88708;
  --color-bnb-800: #9c6e06;
  --color-bnb-900: #7a5404;
  --color-bnb-950: #4a3102;

  /* Binance Dark (neutral) — near-black blue-gray */
  --color-bnbgray-50:  #f5f6f7;
  --color-bnbgray-100: #e8eaed;
  --color-bnbgray-200: #c8cdd6;
  --color-bnbgray-300: #a8afbd;
  --color-bnbgray-400: #848E9C;
  --color-bnbgray-500: #5e6673;
  --color-bnbgray-600: #474d57;
  --color-bnbgray-700: #2B2F36;
  --color-bnbgray-800: #1E2026;
  --color-bnbgray-875: #0F1216;
  --color-bnbgray-900: #0B0E11;
  --color-bnbgray-950: #060809;

  /* Buy green */
  --color-bnbgreen-50:  #e6faf3;
  --color-bnbgreen-100: #b3f0d9;
  --color-bnbgreen-200: #80e6bf;
  --color-bnbgreen-300: #4ddca5;
  --color-bnbgreen-400: #26d48f;
  --color-bnbgreen-500: #0ECB81;
  --color-bnbgreen-600: #0cb472;
  --color-bnbgreen-700: #099c62;
  --color-bnbgreen-800: #077a4d;
  --color-bnbgreen-900: #045738;
  --color-bnbgreen-950: #02331f;

  /* Sell red */
  --color-bnbred-50:  #fef0f2;
  --color-bnbred-100: #fdd0d5;
  --color-bnbred-200: #fba8b1;
  --color-bnbred-300: #f97f8d;
  --color-bnbred-400: #f76c7a;
  --color-bnbred-500: #F6465D;
  --color-bnbred-600: #dd3f54;
  --color-bnbred-700: #c23849;
  --color-bnbred-800: #a6303f;
  --color-bnbred-900: #7d2330;
  --color-bnbred-950: #4a1520;
}

/* ── Radius — sharp, trading-terminal feel ────────────── */
:root {
  --ui-radius: 0.125rem;
}

/* ── Dark-mode background — true Binance black ────────── */
.dark {
  --ui-bg:           var(--color-bnbgray-875);      /* #0F1216 — page canvas */
  --ui-bg-muted:     var(--ui-color-neutral-800);   /* #1E2026 — sidebar / panel */
  --ui-bg-elevated:  var(--ui-color-neutral-700);   /* #2B2F36 — cards */
  --ui-bg-accented:  var(--ui-color-neutral-600);   /* #474d57 — hover */
  --ui-border:       var(--ui-color-neutral-700);
  --ui-border-muted: var(--ui-color-neutral-700);
  --ui-border-accented: var(--ui-color-neutral-600);
  --ui-text:         var(--ui-color-neutral-200);
  --ui-text-muted:   var(--ui-color-neutral-400);   /* #848E9C */
  --ui-text-toned:   var(--ui-color-neutral-300);
  --ui-text-highlighted: white;
  --ui-text-dimmed:  var(--ui-color-neutral-500);
}
```

---

## 4. `app.config.ts`

```ts
export default defineAppConfig({
  ui: {
    colors: {
      primary:   'bnb',       // Binance yellow — #F0B90B
      secondary: 'bnbgreen',  // Buy green     — #0ECB81
      success:   'bnbgreen',
      error:     'bnbred',
      warning:   'bnb',       // yellow doubles as warning
      info:      'sky',
      neutral:   'bnbgray',
    },

    /* ── Button ─────────────────────────────────────── */
    button: {
      defaultVariants: {
        color:   'primary',
        variant: 'solid',
        size:    'sm',
      },
      slots: {
        base: 'font-semibold uppercase tracking-wide',
      },
    },

    /* ── Badge ──────────────────────────────────────── */
    badge: {
      defaultVariants: {
        variant: 'soft',
        size:    'sm',
      },
    },

    /* ── Card ───────────────────────────────────────── */
    card: {
      defaultVariants: {
        variant: 'subtle',
      },
    },

    /* ── Input ──────────────────────────────────────── */
    input: {
      defaultVariants: {
        variant: 'outline',
        size:    'sm',
      },
    },

    /* ── Table ──────────────────────────────────────── */
    table: {
      slots: {
        th: 'px-4 py-3.5 text-xs text-muted font-semibold uppercase tracking-wide text-left rtl:text-right',
        td: 'p-4 text-sm text-muted whitespace-nowrap',
      },
    },
  },
})
```

---

## 5. Color Palette Reference

| Token         | Value     | Usage                                  |
| ------------- | --------- | -------------------------------------- |
| `primary`     | `#F0B90B` | CTAs, highlights, focus rings          |
| `secondary`   | `#0ECB81` | Buy side, positive change, success     |
| `error`       | `#F6465D` | Sell side, negative change, errors     |
| `neutral`     | `#0B0E11` | Page background (dark)                 |
| `neutral-700` | `#2B2F36` | Card / elevated surfaces               |
| `neutral-400` | `#848E9C` | Secondary text, labels                 |
| `info`        | `sky-500` | Informational callouts                 |

---

## 6. Typography

| Role            | Class / Value                                   |
| --------------- | ----------------------------------------------- |
| Font family     | IBM Plex Sans (auto-loaded via `@nuxt/fonts`)   |
| Body            | `text-sm text-muted`                            |
| Heading         | `text-highlighted font-semibold`                |
| Price / number  | `font-mono font-semibold tabular-nums`          |
| Label / caption | `text-xs text-muted uppercase tracking-wide`    |
| Positive delta  | `text-secondary` (green)                        |
| Negative delta  | `text-error` (red)                              |

> Always use `font-mono tabular-nums` for any numerical data (prices, %, quantities) to prevent layout shift during live updates.

---

## 7. Spacing & Density

Binance uses a compact, information-dense layout.

| Context                       | Rule                  |
| ----------------------------- | --------------------- |
| Card padding                  | `p-4` (default) or `p-3` compact |
| Table cell                    | `p-3` or `p-4`        |
| Form fields                   | `size="sm"` on all inputs/selects |
| Buttons in forms              | `size="sm"`           |
| Buttons in toolbar / header   | `size="xs"` or `size="sm"` |
| Section gap                   | `gap-4` or `gap-6`    |
| Panel gap                     | `gap-2` or `gap-3`    |

---

## 8. Dark Mode

The app is **dark-first**. Always code dark mode before light.

- Default `<html>` class: `dark`
- Background layers:
  - **Page canvas:** `bg-default` → `#0F1216` (custom 875 step)
  - **Sidebar / panel:** `bg-muted` → `#1E2026`
  - **Card / elevated:** `bg-elevated` → `#2B2F36`
  - **Hover:** `bg-accented` → `#474d57`
- Border: `border-default` → `#2B2F36`

> Never use hard-coded hex values; always use `bg-*`, `text-*`, `border-*` CSS variable utilities from Nuxt UI.

---

## 9. Component Conventions

### Buttons

```vue
<!-- Primary CTA (Buy) -->
<UButton color="secondary" variant="solid">Buy BTC</UButton>

<!-- Destructive CTA (Sell) -->
<UButton color="error" variant="solid">Sell BTC</UButton>

<!-- Default action -->
<UButton>Trade Now</UButton>

<!-- Ghost/secondary action -->
<UButton color="neutral" variant="ghost">Cancel</UButton>
```

### Price / Change Badges

```vue
<!-- Positive -->
<UBadge color="success" variant="soft">+2.34%</UBadge>

<!-- Negative -->
<UBadge color="error" variant="soft">-1.12%</UBadge>
```

### Market Data Table

```vue
<UTable
  :columns="columns"
  :rows="rows"
  :loading="isLoading"
  loading-animation="carousel"
  loading-color="primary"
/>
```

Column header text should always be uppercase `text-xs text-muted tracking-wide` (already overridden in `app.config.ts`).

### Cards / Panels

```vue
<UCard>
  <!-- variant="subtle" is the default (dark bg-elevated + ring) -->
</UCard>
```

### Form Inputs

```vue
<UInput placeholder="0.00" size="sm" />
<USelect size="sm" />
```

Always pair with `<UFormField>` for accessible labels.

---

## 10. Iconography

Icon set: **lucide** (default Nuxt UI set, no install needed).

Common icons to use:

| Purpose         | Icon                          |
| --------------- | ----------------------------- |
| Trending up     | `i-lucide-trending-up`        |
| Trending down   | `i-lucide-trending-down`      |
| Search          | `i-lucide-search`             |
| Settings        | `i-lucide-settings`           |
| Wallet          | `i-lucide-wallet`             |
| Chart / candle  | `i-lucide-candlestick-chart`  |
| History         | `i-lucide-history`            |
| Copy address    | `i-lucide-copy`               |
| QR code         | `i-lucide-qr-code`            |
| Alert           | `i-lucide-bell`               |
| Verified        | `i-lucide-shield-check`       |
| Logout          | `i-lucide-log-out`            |

---

## 11. Layout Patterns

### Trading Page (3-column)

```
┌─────────────────────────────────────────────────────┐
│  Header (UHeader)  — logo · markets · nav · account │
├──────────┬──────────────────────────┬───────────────┤
│  Order   │   Chart + Trade Pair     │  Order Book / │
│  Form    │   (main content area)    │  Trade History│
│  (250px) │                          │  (280px)      │
├──────────┴──────────────────────────┴───────────────┤
│  Open Orders / History (full-width UTable)          │
└─────────────────────────────────────────────────────┘
```

- Use CSS Grid: `grid-cols-[250px_1fr_280px]`
- All panels: `bg-muted` with `border-r border-default`

### Dashboard Page (2-column)

```
┌─────────────────────────────────────────────────────┐
│  Portfolio value · 24h PnL · Asset allocation       │
├───────────────────────┬─────────────────────────────┤
│  Asset list (UTable)  │  Activity / Recent trades   │
└───────────────────────┴─────────────────────────────┘
```

---

## 12. Dos and Don'ts

### ✅ Do

- Always use `tabular-nums font-mono` on numeric data.
- Keep radius at the configured `0.125rem` (nearly sharp). Don't add extra `rounded-*` classes on top.
- Use `variant="soft"` badges for percentage changes; they are the most readable at small sizes.
- Use `loading-animation="carousel"` on all data tables.
- Use `color="secondary"` (green) for buy / positive flows and `color="error"` (red) for sell / negative flows — consistently everywhere.

### ❌ Don't

- Don't use `variant="outline"` on primary buttons — Binance uses solid fills for all main CTAs.
- Don't use light backgrounds (white, gray-50) without wrapping in a light-mode check.
- Don't mix icon sets. Stick to lucide.
- Don't use decorative shadows. Binance uses borders + background contrast, not drop-shadows.
- Don't use `text-base` or larger for table cells — keep data dense.

---

## 13. Status Badge Color Mapping

Status badges must convey state at a glance. Mapping is **fixed** — never reassign a status to a different color, even per-screen. Always pair the badge with a leading dot or icon so the meaning carries without color (accessibility + dense-table scannability).

### Trading order statuses

Modelled on Binance's order-status enum (`NEW`, `PARTIALLY_FILLED`, `FILLED`, `CANCELED`, `EXPIRED`, `REJECTED`).

| Status              | Color       | Variant | Icon                         | Notes                                                  |
| ------------------- | ----------- | ------- | ---------------------------- | ------------------------------------------------------ |
| `NEW` / Open        | `info`      | `soft`  | `i-lucide-circle-dot`        | Working on the book, awaiting fill                     |
| `PARTIALLY_FILLED`  | `primary`   | `soft`  | `i-lucide-loader-circle`     | Yellow signals "in progress, attention warranted"      |
| `FILLED` / Complete | `success`   | `soft`  | `i-lucide-check`             | Terminal success state                                 |
| `CANCELED`          | `neutral`   | `soft`  | `i-lucide-x`                 | User-initiated termination, no error                   |
| `EXPIRED`           | `neutral`   | `soft`  | `i-lucide-clock`             | Same neutral weight as CANCELED — no fault             |
| `REJECTED` / Failed | `error`     | `soft`  | `i-lucide-circle-alert`      | System refusal — implies user action needed            |

### Generic application statuses

For non-trading flows (KYC, withdrawals, deposits, verification, listings):

| Status               | Color       | Variant |
| -------------------- | ----------- | ------- |
| Active / Verified    | `success`   | `soft`  |
| Pending / Processing | `primary`   | `soft`  |
| Under Review         | `info`      | `soft`  |
| Rejected / Failed    | `error`     | `soft`  |
| Suspended / Blocked  | `error`     | `solid` |
| Inactive / Disabled  | `neutral`   | `soft`  |
| Archived             | `neutral`   | `outline` (see §14) |

### Example

```vue
<!-- Order row status -->
<UBadge color="primary" variant="soft" icon="i-lucide-loader-circle">
  Partially Filled
</UBadge>

<UBadge color="success" variant="soft" icon="i-lucide-check">
  Filled
</UBadge>

<UBadge color="neutral" variant="soft" icon="i-lucide-x">
  Canceled
</UBadge>
```

> **Rule:** `primary` (yellow) is reserved for *active in-progress* states. Never use `primary` for a terminal success — that's `success` (green). Never use `error` (red) for a user-canceled action — cancellation is neutral; only system failures are red.

---

## 14. Archived Badge Variant Policy

Archived items are intentionally **de-emphasized** but must remain legible. They follow stricter rules than other statuses because they appear next to active items and must visually recede.

### Rules

1. **Always use `variant="outline"` with `color="neutral"`** for the archived badge itself.
   - Soft variants are reserved for *live* statuses; outline communicates "inert / historical".
2. **The entire row** containing an archived item drops to `text-dimmed` for non-key columns. Numeric columns (price, qty) stay `text-muted` so they remain readable.
3. **No icon** on the archived badge — keep it text-only to reduce visual noise. Icons signal "this needs attention"; archived items don't.
4. **Lowercase or sentence case**, not uppercase. Uppercase pairs with active CTAs (per §4 button slot); archived is the opposite tone.
5. **Never combine archived with a status badge.** If something is both Filled and Archived, show only the archived badge — archival supersedes prior status in the row context. The detail page can show both.

### Example

```vue
<!-- Correct: outline, neutral, no icon, sentence case -->
<UBadge color="neutral" variant="outline">Archived</UBadge>

<!-- Wrong: soft variant gives it too much weight -->
<UBadge color="neutral" variant="soft">ARCHIVED</UBadge> <!-- ❌ -->

<!-- Wrong: icon implies the user needs to act on it -->
<UBadge color="neutral" variant="outline" icon="i-lucide-archive">Archived</UBadge> <!-- ❌ -->
```

### Row treatment

```vue
<tr :class="row.archived && 'text-dimmed'">
  <td>{{ row.pair }}</td>
  <td class="font-mono tabular-nums text-muted">{{ row.price }}</td>
  <td>
    <UBadge v-if="row.archived" color="neutral" variant="outline">
      Archived
    </UBadge>
    <UBadge v-else :color="statusColor(row.status)" variant="soft">
      {{ row.status }}
    </UBadge>
  </td>
</tr>
```

---

## 15. List-Row Hover Pattern

Trading UIs are scanned, not read. Hover state must (a) confirm pointer position without distracting the eye from adjacent rows, and (b) reveal row-level actions only when the user opts in.

### Base pattern

| State    | Background        | Border / Indicator                | Cursor      |
| -------- | ----------------- | --------------------------------- | ----------- |
| Default  | transparent       | `border-b border-default`         | `default`   |
| Hover    | `bg-elevated`     | `border-b border-default` (same)  | `pointer`   |
| Active   | `bg-elevated`     | `border-l-2 border-primary`       | `pointer`   |
| Selected | `bg-accented`     | `border-l-2 border-primary`       | `default`   |
| Disabled | transparent       | `text-dimmed`                     | `not-allowed` |

> Never animate the row background on hover (no fade-in transitions on `bg`). Trading data updates frequently — animations on the row layer compete with live price flashes. Color change is instant.

### Implementation

```vue
<tr
  class="
    border-b border-default
    hover:bg-elevated hover:cursor-pointer
    data-[selected=true]:bg-accented
    data-[selected=true]:border-l-2 data-[selected=true]:border-primary
    transition-none
  "
>
  ...
</tr>
```

### Row actions on hover

Row-level actions (cancel, edit, copy address, view detail) live in a **trailing actions cell** that is `opacity-0` by default and `group-hover:opacity-100`. This keeps the table calm at rest and progressive on interaction.

```vue
<tr class="group border-b border-default hover:bg-elevated">
  <td>BTC/USDT</td>
  <td class="font-mono tabular-nums">68,432.10</td>
  <td>
    <div class="opacity-0 group-hover:opacity-100 flex gap-1 justify-end">
      <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-x" />
      <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-pencil" />
    </div>
  </td>
</tr>
```

### Price-flash interaction

When a numeric cell updates live, briefly flash the **cell** (not the row) — `bg-success/20` for upticks, `bg-error/20` for downticks, decay over 400ms. Hover state on the row continues to work because the flash is on the cell and uses an alpha-blended color.

### Don'ts

- Don't use `hover:scale-*` or any transform — it breaks pixel alignment of monospaced numeric columns.
- Don't change text color on hover; only background. Text shifts pull the eye off the data.
- Don't show a hover state on rows that aren't navigable. If the row has no click target, leave it static.

---

## 16. Heading Scale

Headings are deliberately **restrained**. Trading UIs prioritize tabular data; oversized headings waste vertical space and weaken the data hierarchy. Use `text-highlighted` (white on dark) only for true page-level titles; everything else is `text-default`.

| Level   | Tailwind classes                                     | Use case                                                   |
| ------- | ---------------------------------------------------- | ---------------------------------------------------------- |
| Display | `text-3xl font-semibold tracking-tight text-highlighted` | Marketing / landing only — never inside the app shell  |
| H1      | `text-xl font-semibold text-highlighted`             | Page title (e.g. "Spot Trading", "Portfolio")              |
| H2      | `text-base font-semibold text-highlighted`           | Section title within a page (e.g. "Open Orders")           |
| H3      | `text-sm font-semibold text-default`                 | Sub-section / card title (e.g. "Order Book", "Recent Trades") |
| H4      | `text-xs font-semibold uppercase tracking-wide text-muted` | Group label / overline (e.g. "ASSET ALLOCATION")     |
| Body    | `text-sm text-muted`                                 | Default paragraph text                                     |
| Caption | `text-xs text-muted`                                 | Helper text, timestamps, secondary metadata                |

### Rules

- **Maximum one H1 per page.** It typically sits in the page header next to breadcrumbs or the trading pair selector.
- **H2 is the workhorse** for in-app section titles. It's intentionally small (`text-base`) — Binance does not use large headings inside the trading shell.
- **H4 is overline-style** and pairs with `tracking-wide uppercase`. Use it for table-section labels, sidebar groupings, and stat-card captions ("24H VOLUME", "MARKET CAP"). It mirrors the table header treatment from §4 — this is intentional and creates visual rhythm.
- **Never use `font-bold`.** All headings stop at `font-semibold` (600). Bold is reserved for inline numeric emphasis on price changes.
- **Numeric headings** (e.g. portfolio value display) override the rule and use `font-mono tabular-nums` at H1 size: `text-xl font-semibold font-mono tabular-nums text-highlighted`.

### Example composition

```vue
<section>
  <!-- H1: page title -->
  <h1 class="text-xl font-semibold text-highlighted">Portfolio</h1>

  <!-- Numeric H1 variant -->
  <p class="text-xl font-semibold font-mono tabular-nums text-highlighted">
    $24,318.42
  </p>

  <!-- H4 overline above a stat -->
  <p class="text-xs font-semibold uppercase tracking-wide text-muted">
    24H Change
  </p>
  <p class="text-sm font-mono tabular-nums text-secondary">+2.34%</p>

  <!-- H2: section -->
  <h2 class="text-base font-semibold text-highlighted mt-6 mb-3">
    Open Orders
  </h2>

  <!-- H3: card title inside section -->
  <h3 class="text-sm font-semibold text-default mb-2">Order Book</h3>
</section>
```

### Don'ts

- Don't use `text-2xl` or larger inside the trading shell. It breaks the dense rhythm.
- Don't apply `text-highlighted` to H3 or below — reserve white for the top of the hierarchy only.
- Don't combine `uppercase` with H1/H2/H3. Uppercase is exclusively an H4 / table-header / button signal.

---

## 17. Nuxt UI v3 Quick Reference

```vue
<!-- Core components used in this project -->
<UButton>
<UInput> <USelect> <UFormField> <UForm>
<UTable>
<UCard>
<UBadge>
<UTabs>
<UModal> <UDrawer>
<USlideover>
<UPopover> <UTooltip>
<UDropdownMenu>
<UNavigationMenu>
<UHeader> <USidebar>
<USeparator>
<UProgress>
<UAvatar>
<UAlert>
<UToast> <!-- via useToast() -->
<UIcon name="i-lucide-*" />
```

All components are auto-imported. No manual import statements needed.

---

> Keep this file up-to-date whenever design decisions change.

---

## How to use it

Drop this as `DESIGN.md` at your project root. When you start a Claude Code session, reference it with:

> *"Follow the conventions in DESIGN.md when building this feature."*

A few things worth noting for your implementation:

- The two custom color palettes (`bnb` and `bnbgray`) must be defined in `main.css` exactly as shown — Nuxt UI picks them up automatically by name in `app.config.ts`.
- The `IBM Plex Sans` font is loaded automatically by `@nuxt/fonts` (built into Nuxt UI) — no extra config.
- The `tabular-nums font-mono` note for price cells is critical for live-updating order books to avoid layout jitter.