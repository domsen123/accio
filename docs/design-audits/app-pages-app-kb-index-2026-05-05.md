# Design Audit — app/pages/app/kb/index.vue — 2026-05-05

## Summary
- Files scanned: 1
- Critical: 2 | Major: 8 | Minor: 4
- Estimated effort: S (<1h)
- Headline issues (top 3 things to fix first):
  1. `shadow-sm` on the sidebar and filter-bar containers violates the "no drop shadows for elevation" rule.
  2. Status-tinted card backgrounds (`bg-info/5`, `bg-warning/5`, `bg-success/5`) bypass the documented card surface (`bg-elevated`) and the documented hover (`hover:bg-muted` / `hover:bg-accented`).
  3. The KB entry slug — an identifier — renders without `font-mono`, breaking the system's "trustworthy data voice".

## Findings by file

### app/pages/app/kb/index.vue

- **critical** — line 227: left-rail container `rounded-lg border border-default bg-elevated p-4 shadow-sm`. DESIGN.md §Cards / §Don't is explicit: "We do not use box-shadows on cards. Depth comes from `bg-elevated`." Fix: drop `shadow-sm`.
- **critical** — line 238: filter-bar container same pattern with `shadow-sm`. Same fix: remove `shadow-sm`.

- **major** — lines 144-151 (`statusCardBg`) + line 360 (applied as card root class): list-row cards are tinted with `bg-info/5`, `bg-warning/5`, `bg-success/5`, with custom hover `hover:bg-info/10` etc. DESIGN.md §Cards mandates `bg-elevated` for cards; §Lists pins hover to `hover:bg-muted` / `hover:bg-accented`. Status semantics belong on the `<UBadge>`, not the surface. Fix: drop the tint helper; let the card stay `bg-elevated` and use `hover:bg-accented`. Status remains conveyed by the badge.
- **major** — line 388: `<p class="text-sm text-muted truncate">{{ entry.slug }}</p>`. Slug is an identifier — DESIGN.md §Typography "Numbers, IDs, dates ... always `font-mono`" and §Do "Use `font-mono` for every number, identifier, date, ...". Fix: add `font-mono`.
- **major** — line 375: `<UBadge ... class="uppercase tracking-wide font-bold">`. DESIGN.md §Typography: "Tracking/letter-spacing only on display sizes via `tracking-tight`; no custom tracking values." Also overrides badge typography. Fix: drop `tracking-wide font-bold uppercase` — let `<UBadge>` render its default; if the all-caps treatment is desired, raise it as a doc question first.
- **major** — line 362 (`body: 'p-5'`): card internal padding `p-5` is outside the documented spacing tokens for cards. DESIGN.md §Spacing lists `p-4` / `p-6` / `p-8` as the card padding scale. Fix: use `p-4` (matches list-density) or `p-6` (default card).
- **major** — line 368: card title uses `text-lg font-semibold`. `text-lg` is not in the documented scale. Card title should be Title md = `text-xl font-semibold` (DESIGN.md §Typography hierarchy, "Card titles, modal titles"). Fix: use `text-xl font-semibold`, or step down to Title sm = `text-base font-semibold` if denser feel is desired.
- **major** — line 341: empty-state heading `text-lg font-semibold`. Same out-of-scale issue. Fix: `text-xl font-semibold` (Title md) for the empty-state title.
- **major** — line 431-439: a `<UButton>` is rendered inside a `<NuxtLink>` (line 352) wrapping the entire row. This is a button-inside-link DOM anti-pattern — invalid HTML and confusing for assistive tech, even with `tabindex="-1"`. Fix: use a non-interactive `<UIcon name="i-lucide-arrow-right" class="size-5 text-muted" />` as a visual affordance only, or move the link to the icon and make the row clickable via JS. The current `tabindex="-1"` workaround acknowledges the issue.
- **major** — line 419: `<UAvatar :alt="entry.authorName" size="2xs" />` rendered with no `src` or initial-derivation; only `alt`. Visually this is an empty 16px disc next to the author name. Not strictly a DESIGN.md violation, but per §Iconography avatars carry meaning — either render initials/`src`, or replace with `i-lucide-user` `size-4` next to the name to match the clock-icon meta pattern beside it.

- **minor** — line 340: `<UIcon class="size-10 text-muted" />` for empty-state. DESIGN.md §Iconography lists 4 / 5 / 6 as defaults; nothing documented for empty-state hero icons. Acceptable but flag as a doc gap.
- **minor** — line 376: badge inner text `{{ t(\`kb.status.\${entry.status}\`) }}` — fine, just confirming i18n is correctly applied. No issue; included so the next reviewer doesn't re-flag it.
- **minor** — line 423: clock icon `class="size-4"` paired with `text-xs` meta text. Body-text icon size is `size-4`; with `text-xs` (12px caption), `size-3.5` would track more proportionally. Not in scale; leave as-is unless a meta-icon size is documented.
- **minor** — line 367 + line 393 + line 417: title row, badges row, meta row each use ad-hoc gaps (`gap-3`, `gap-1`, `gap-4`). Not wrong — but consider standardising the inner card stack to a single rhythm (`space-y-2` on the column wrapper already exists at line 365; the extra `pt-1` on line 417 is the only out-of-rhythm addition). Drop `pt-1`.

## Recommended fix order

1. Remove `shadow-sm` from the two outer containers (lines 227, 238). Mechanical.
2. Replace `statusCardBg` tinting with plain `bg-elevated hover:bg-accented` and let `<UBadge>` carry the status. Removes 8 lines and one helper.
3. Add `font-mono` to the slug paragraph (line 388).
4. Strip `uppercase tracking-wide font-bold` from the status badge (line 375).
5. Swap `text-lg` → `text-xl` on entry title (line 368) and empty-state heading (line 341).
6. Normalise card body padding `p-5` → `p-4` or `p-6` (line 362).
7. Fix the button-in-link by replacing the trailing `<UButton>` with a `<UIcon>` visual affordance (lines 431-439).
8. Decide on the avatar: render with initials/src or replace with `i-lucide-user` (line 419).

## DESIGN.md gaps surfaced

- **Empty-state hero icon size.** §Iconography only documents 4 / 5 / 6. Empty-state pages currently land on `size-10`. Either bless `size-10` for empty-state heroes or define a documented size.
- **Meta-row icon size.** When meta text is `text-xs`, paired Lucide icons currently use `size-4` (matches body, not caption). Document either `size-3.5` for caption-paired icons, or confirm `size-4` is intended even alongside `text-xs`.
- **Status-tinted list rows.** No guidance on whether status semantics may bleed onto the row surface (vs. staying confined to a badge). Worth an explicit yes/no in §Lists or §Tags and chips.
- **All-caps small badges.** Several places in the codebase reach for `uppercase tracking-wide` on small status pills. §Typography forbids custom tracking. Either bless `tracking-wide` for caps badges, or document a "no caps badges" rule.
- **Author avatar fallback.** §Iconography mentions avatars at 32/24, but not the initials/placeholder treatment when no image is available. Worth adding.
