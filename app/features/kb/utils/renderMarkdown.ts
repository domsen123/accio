/**
 * Markdown renderer for the KB editor preview pane (T-1.9).
 *
 * Pipeline:
 *   1. Run `parseWikilinks` (the same shared helper the server uses to
 *      materialise `kb_entry_links`) against the body to get a deduplicated
 *      list of every `[[slug]]` / `[[Title|slug]]` outside of code regions.
 *      Returned in occurrence order.
 *   2. Replace each parsed wikilink with a marker token before handing the
 *      body to `marked`. The marker is built from Unicode Private Use Area
 *      codepoints (U+E000 / U+E001) — they survive marked's tokenisation
 *      (no Markdown syntax uses PUA characters) and can't collide with
 *      anything the user types.
 *   3. Run `marked` to produce HTML.
 *   4. Replace each marker with the final `<a>` tag using the supplied
 *      resolver to pick the resolved-vs-unresolved class set.
 *
 * The pre-replace + post-replace sandwich means marked never sees the
 * wikilink syntax (so it doesn't try to parse `[[` as a footnote or link
 * fragment) and we don't have to pull a marked extension just for one rule.
 *
 * The renderer is dependency-light: only `marked` (already in the tree via
 * `@tiptap/markdown`) and the shared wikilink parser. It runs identically on
 * server and client.
 */
import type { WikilinkRef } from '../../../../shared/kb/markdown'
import { marked } from 'marked'
import { parseWikilinks, wikilinkLabel } from '../../../../shared/kb/markdown'

export interface WikilinkResolver {
  /** Returns true when the slug resolves to an existing workspace entry. */
  isResolved: (slug: string) => boolean
  /** Build the navigation target for a wikilink. */
  hrefFor: (slug: string) => string
}

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const MARKER_OPEN = String.fromCharCode(0xE000)
const MARKER_CLOSE = String.fromCharCode(0xE001)

const buildMarker = (index: number): string =>
  `${MARKER_OPEN}${index}${MARKER_CLOSE}`

const MARKER_RE = new RegExp(`${MARKER_OPEN}(\\d+)${MARKER_CLOSE}`, 'g')

/**
 * Replace every `[[...]]` outside of code regions in `body` with an opaque
 * marker. Returns the rewritten body and the parallel list of refs the
 * post-process step uses. Indented and inline code are preserved unchanged
 * because the replacement walks the body with the same fence + inline-code
 * state machine that `parseWikilinks` uses.
 *
 * Defensively, if a candidate `[[ ... ]]` doesn't match the next ref the
 * shared parser produced, we emit it verbatim and don't advance the ref
 * cursor — keeps the post-process replace step in step.
 */
const replaceWikilinks = (
  body: string,
): { rewritten: string, refs: WikilinkRef[] } => {
  const refs = parseWikilinks(body)
  if (refs.length === 0)
    return { rewritten: body, refs: [] }

  const out: string[] = []
  let refIdx = 0
  let inFence = false
  let fenceChar = ''
  let fenceLen = 0

  const lines = body.split('\n')
  for (let lineNo = 0; lineNo < lines.length; lineNo++) {
    const line = lines[lineNo] ?? ''

    if (inFence) {
      const closeMatch = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/)
      const fence = closeMatch?.[1]
      if (fence && fence[0] === fenceChar && fence.length >= fenceLen) {
        inFence = false
        fenceChar = ''
        fenceLen = 0
      }
      out.push(line)
      if (lineNo < lines.length - 1)
        out.push('\n')
      continue
    }

    const openMatch = line.match(/^ {0,3}(`{3,}|~{3,})/)
    const opener = openMatch?.[1]
    if (opener) {
      inFence = true
      fenceChar = opener[0] ?? ''
      fenceLen = opener.length
      out.push(line)
      if (lineNo < lines.length - 1)
        out.push('\n')
      continue
    }

    // Non-fenced line: scan for inline code spans + wikilinks.
    let p = 0
    while (p < line.length) {
      const ch = line[p] ?? ''
      if (ch === '`') {
        // Inline code span — find the matching close run.
        const runStart = p
        let runLen = 0
        while (p < line.length && line[p] === '`') {
          runLen++
          p++
        }
        let q = p
        let closed = false
        while (q < line.length) {
          if (line[q] === '`') {
            let closeLen = 0
            while (q < line.length && line[q] === '`') {
              closeLen++
              q++
            }
            if (closeLen === runLen) {
              out.push(line.slice(runStart, q))
              p = q
              closed = true
              break
            }
            // Wrong length — keep scanning past this run (already advanced q).
            continue
          }
          q++
        }
        if (!closed) {
          // Unterminated: emit the original backticks and continue scanning.
          out.push(line.slice(runStart, p))
        }
        continue
      }

      if (ch === '[' && line[p + 1] === '[') {
        // Honour the escape rule (a single backslash before `[[` disables
        // the wikilink). Match the shared parser's behaviour exactly.
        const precededByBackslash
          = p > 0 && line[p - 1] === '\\' && (p < 2 || line[p - 2] !== '\\')
        if (precededByBackslash) {
          out.push(ch)
          p++
          continue
        }
        const closeIdx = line.indexOf(']]', p + 2)
        if (closeIdx === -1) {
          out.push(ch)
          p++
          continue
        }
        const inner = line.slice(p + 2, closeIdx)
        const ref = refs[refIdx]
        if (!ref) {
          out.push(line.slice(p, closeIdx + 2))
          p = closeIdx + 2
          continue
        }
        const pipeIdx = inner.indexOf('|')
        const candidateSlug = (pipeIdx === -1 ? inner : inner.slice(pipeIdx + 1)).trim()
        const candidateDisplay
          = pipeIdx === -1 ? null : (inner.slice(0, pipeIdx).trim() || null)
        if (
          candidateSlug === ref.targetSlug
          && candidateDisplay === ref.displayText
        ) {
          out.push(buildMarker(refIdx))
          refIdx++
        }
        else {
          out.push(line.slice(p, closeIdx + 2))
        }
        p = closeIdx + 2
        continue
      }

      out.push(ch)
      p++
    }

    if (lineNo < lines.length - 1)
      out.push('\n')
  }

  return { rewritten: out.join(''), refs }
}

const renderMarkerHtml = (ref: WikilinkRef, resolver: WikilinkResolver): string => {
  const slug = ref.targetSlug
  const label = wikilinkLabel(ref)
  const resolved = resolver.isResolved(slug)
  const href = resolver.hrefFor(slug)
  const cls = resolved
    ? 'kb-wikilink kb-wikilink--resolved'
    : 'kb-wikilink kb-wikilink--unresolved'
  const ariaLabel = resolved
    ? `Wikilink to ${slug}`
    : `Unresolved wikilink to ${slug}`
  const badge = resolved
    ? ''
    : '<span class="kb-wikilink__badge" aria-hidden="true">?</span>'
  return `<a href="${escapeHtml(href)}" class="${cls}" data-kb-wikilink="${escapeHtml(slug)}" data-kb-resolved="${resolved ? '1' : '0'}" aria-label="${escapeHtml(ariaLabel)}">${escapeHtml(label)}${badge}</a>`
}

export const renderKbMarkdown = (
  body: string,
  resolver: WikilinkResolver,
): string => {
  const { rewritten, refs } = replaceWikilinks(body || '')
  // marked synchronous mode keeps SSR + reactive call sites simple.
  const html = marked.parse(rewritten, { async: false }) as string
  return html.replace(MARKER_RE, (_full, idxStr: string) => {
    const idx = Number(idxStr)
    const ref = refs[idx]
    if (!ref)
      return ''
    return renderMarkerHtml(ref, resolver)
  })
}

/**
 * Extract the unique target slugs from a body so callers can prime the
 * resolver before rendering. Order is preserved by first occurrence.
 */
export const extractWikilinkTargets = (body: string): string[] => {
  const refs = parseWikilinks(body)
  const seen = new Set<string>()
  const out: string[] = []
  for (const ref of refs) {
    if (!seen.has(ref.targetSlug)) {
      seen.add(ref.targetSlug)
      out.push(ref.targetSlug)
    }
  }
  return out
}
