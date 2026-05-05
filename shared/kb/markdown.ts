// Wikilink parsing for KB entry bodies (DESIGN-WIKILINKS, REQ-KB-4).
//
// Pure function; no Node / DB / Nuxt deps. Lives under `shared/` so both the
// server-side rebuild path and the client-side preview renderer can call it
// without duplicating the regex.
//
// Two syntactic forms:
//   - `[[slug]]`              -> { targetSlug: 'slug', displayText: null }
//   - `[[Title|slug]]`        -> { targetSlug: 'slug', displayText: 'Title' }
//
// Whitespace surrounding `Title`, `slug`, and the lone `slug` form is trimmed.
//
// Code-block exclusion: wikilinks inside fenced code blocks (``` ... ``` or
// ~~~ ... ~~~ per CommonMark) and inside inline code spans (`...`) are NOT
// parsed. Indented (4-space) code blocks are also code per CommonMark, but we
// scope to fenced + inline only — see the deviation note in specs/tasks.md.
//
// Escaping: `\[[slug]]` (a single backslash before the opening bracket pair)
// is NOT treated as a wikilink, mirroring Markdown's escape rules.
//
// The parser does NOT slugify — DESIGN-WIKILINKS makes the caller responsible
// for slug resolution. We return the literal slug as written, trimmed.
//
// Returns one entry per parsed occurrence — the caller deduplicates if/when
// desired.

export interface WikilinkRef {
  targetSlug: string
  displayText: string | null
}

/**
 * Mask inline code spans (`...`, ``...``) on a single line. Replaces every
 * character between matched backtick runs (inclusive of the backticks) with
 * spaces so wikilink detection skips them.
 */
const maskInlineCode = (line: string): string => {
  let result = ''
  let i = 0
  while (i < line.length) {
    if (line[i] === '`') {
      // Count run length.
      const runStart = i
      let runLen = 0
      while (i < line.length && line[i] === '`') {
        runLen++
        i++
      }
      // Search for a matching run of exactly runLen backticks.
      let j = i
      let closed = false
      while (j < line.length) {
        if (line[j] === '`') {
          let closeLen = 0
          while (j < line.length && line[j] === '`') {
            closeLen++
            j++
          }
          if (closeLen === runLen) {
            // Mask runStart..j with spaces.
            result += ' '.repeat(j - runStart)
            i = j
            closed = true
            break
          }
          // Wrong length — keep scanning past this run.
          continue
        }
        j++
      }
      if (!closed) {
        // Unterminated inline code: emit the original backticks and continue
        // scanning the rest of the line normally (nothing to mask).
        result += line.slice(runStart, i)
      }
    }
    else {
      result += line[i]
      i++
    }
  }
  return result
}

/**
 * Replace every character inside fenced code blocks and inline code spans
 * with a space so a downstream regex never matches inside them, while
 * preserving line numbers and column offsets for any future use.
 */
const maskCodeRegions = (body: string): string => {
  const lines = body.split('\n')
  let inFence = false
  let fenceChar = ''
  let fenceLen = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''

    if (inFence) {
      // Closing fence: same char, length >= opening, optional trailing whitespace.
      const closeMatch = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/)
      const fence = closeMatch?.[1]
      if (fence && fence[0] === fenceChar && fence.length >= fenceLen) {
        // Whole closing line is fence syntax — keep it as-is (no wikilinks possible).
        inFence = false
        fenceChar = ''
        fenceLen = 0
      }
      else {
        // Inside fenced block — mask the entire line.
        lines[i] = ' '.repeat(line.length)
      }
      continue
    }

    // Not in fence: detect opener.
    const openMatch = line.match(/^ {0,3}(`{3,}|~{3,})/)
    const opener = openMatch?.[1]
    if (opener) {
      inFence = true
      fenceChar = opener[0] ?? ''
      fenceLen = opener.length
      // Opener line itself is fence syntax (with optional info string) — no wikilinks.
      continue
    }

    // Not in fence: mask inline code spans on this line.
    lines[i] = maskInlineCode(line)
  }

  return lines.join('\n')
}

// Match `[[ ... ]]` not preceded by an odd number of backslashes (escape).
// We use a lookbehind that asserts the position before `[[` is not preceded
// by exactly one backslash. This is sufficient for the spec's "single
// backslash escape" rule. The negative lookbehind is fixed-length, supported
// in modern V8.
const WIKILINK_RE = /(?<!\\)\[\[([^\]\n]+)\]\]/g

export const parseWikilinks = (body: string): WikilinkRef[] => {
  if (!body)
    return []

  const masked = maskCodeRegions(body)
  const refs: WikilinkRef[] = []

  for (const match of masked.matchAll(WIKILINK_RE)) {
    const inner = match[1]
    if (!inner)
      continue

    let targetSlug: string
    let displayText: string | null

    const pipeIdx = inner.indexOf('|')
    if (pipeIdx === -1) {
      targetSlug = inner.trim()
      displayText = null
    }
    else {
      displayText = inner.slice(0, pipeIdx).trim()
      targetSlug = inner.slice(pipeIdx + 1).trim()
      if (displayText.length === 0)
        displayText = null
    }

    if (!targetSlug)
      continue

    refs.push({ targetSlug, displayText })
  }

  return refs
}

/**
 * For a parsed wikilink, return the visible label per DESIGN-WIKILINKS. The
 * pipe form's left side wins; otherwise we fall back to the slug as written.
 */
export const wikilinkLabel = (ref: WikilinkRef): string =>
  ref.displayText ?? ref.targetSlug
