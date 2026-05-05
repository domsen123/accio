/**
 * Renderer-level tests for the KB Markdown preview pipeline (T-1.9).
 *
 * The renderer composes the shared wikilink parser with `marked`. We assert
 * the contract the preview pane depends on:
 *   - resolved + unresolved wikilinks render as `<a>` tags with the correct
 *     class names and `data-kb-resolved` attribute;
 *   - wikilinks inside fenced code blocks pass through verbatim;
 *   - wikilinks inside inline code spans pass through verbatim;
 *   - the renderer round-trips an empty body to an empty string.
 *
 * Lives in `tests/` (vitest 'unit' project) — pure module imports, no DB.
 */
import { describe, expect, it } from 'vitest'
import {
  extractWikilinkTargets,
  renderKbMarkdown,
} from '../app/features/kb/utils/renderMarkdown'

const resolver = (resolved: string[]) => ({
  isResolved: (slug: string) => resolved.includes(slug),
  hrefFor: (slug: string) => `/app/kb/${slug}`,
})

describe('renderKbMarkdown', () => {
  it('returns empty string for empty body', () => {
    expect(renderKbMarkdown('', resolver([]))).toBe('')
  })

  it('renders a resolved wikilink with the resolved class + attribute', () => {
    const html = renderKbMarkdown('See [[other]].', resolver(['other']))
    expect(html).toContain('class="kb-wikilink kb-wikilink--resolved"')
    expect(html).toContain('data-kb-resolved="1"')
    expect(html).toContain('href="/app/kb/other"')
    expect(html).toContain('>other<')
    expect(html).not.toContain('kb-wikilink__badge')
  })

  it('renders an unresolved wikilink with the unresolved class + badge', () => {
    const html = renderKbMarkdown('See [[missing]].', resolver([]))
    expect(html).toContain('class="kb-wikilink kb-wikilink--unresolved"')
    expect(html).toContain('data-kb-resolved="0"')
    expect(html).toContain('kb-wikilink__badge')
  })

  it('respects the [[Title|slug]] form for the visible label', () => {
    const html = renderKbMarkdown('[[My Title|the-slug]]', resolver(['the-slug']))
    expect(html).toContain('href="/app/kb/the-slug"')
    expect(html).toContain('>My Title<')
  })

  it('does not render wikilinks inside fenced code blocks', () => {
    const body = '```\n[[notalink]]\n```\n'
    const html = renderKbMarkdown(body, resolver([]))
    expect(html).not.toContain('kb-wikilink')
    expect(html).toContain('[[notalink]]')
  })

  it('does not render wikilinks inside inline code', () => {
    const body = 'use `[[notalink]]` here'
    const html = renderKbMarkdown(body, resolver([]))
    expect(html).not.toContain('kb-wikilink')
    expect(html).toContain('[[notalink]]')
  })

  it('renders standard Markdown unrelated to wikilinks', () => {
    const html = renderKbMarkdown('# Title\n\n**bold** and *italic*', resolver([]))
    expect(html).toContain('<h1>Title</h1>')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<em>italic</em>')
  })
})

describe('extractWikilinkTargets', () => {
  it('returns unique slugs in occurrence order', () => {
    const body = 'a [[foo]] b [[bar]] c [[foo]] d [[baz]]'
    expect(extractWikilinkTargets(body)).toEqual(['foo', 'bar', 'baz'])
  })

  it('returns empty array for body without wikilinks', () => {
    expect(extractWikilinkTargets('plain text')).toEqual([])
  })

  it('excludes wikilinks inside fenced code blocks', () => {
    const body = '```\n[[in-code]]\n```\n[[outside]]'
    expect(extractWikilinkTargets(body)).toEqual(['outside'])
  })
})
