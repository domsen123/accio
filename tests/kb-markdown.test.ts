import { describe, expect, it } from 'vitest'

import { parseWikilinks } from '../server/features/kb/markdown'

describe('parseWikilinks', () => {
  it('returns an empty array for empty body', () => {
    expect(parseWikilinks('')).toEqual([])
  })

  it('parses [[slug]] with displayText null', () => {
    expect(parseWikilinks('See [[other-note]].')).toEqual([
      { targetSlug: 'other-note', displayText: null },
    ])
  })

  it('parses [[Title|slug]] populating displayText and slug', () => {
    expect(parseWikilinks('See [[Other Note|other-note]].')).toEqual([
      { targetSlug: 'other-note', displayText: 'Other Note' },
    ])
  })

  it('trims whitespace inside the brackets in both forms', () => {
    expect(parseWikilinks('a [[ slug ]] b')).toEqual([
      { targetSlug: 'slug', displayText: null },
    ])
    expect(parseWikilinks('a [[ Title | slug ]] b')).toEqual([
      { targetSlug: 'slug', displayText: 'Title' },
    ])
  })

  it('does not parse an escaped wikilink \\[[slug]]', () => {
    // A leading backslash before the opening bracket pair means "literal".
    expect(parseWikilinks('escaped \\[[slug]] text')).toEqual([])
  })

  it('does not parse wikilinks inside ``` fenced blocks (no language tag)', () => {
    const body = [
      'prose [[a]]',
      '```',
      '[[hidden]]',
      '```',
      'more [[b]]',
    ].join('\n')
    expect(parseWikilinks(body)).toEqual([
      { targetSlug: 'a', displayText: null },
      { targetSlug: 'b', displayText: null },
    ])
  })

  it('does not parse wikilinks inside ``` fenced blocks with language tag', () => {
    const body = [
      'prose [[a]]',
      '```ts',
      'const x = "[[hidden]]"',
      '```',
      'more [[b]]',
    ].join('\n')
    expect(parseWikilinks(body)).toEqual([
      { targetSlug: 'a', displayText: null },
      { targetSlug: 'b', displayText: null },
    ])
  })

  it('does not parse wikilinks inside ~~~ fenced blocks', () => {
    const body = [
      'prose [[a]]',
      '~~~sql',
      'SELECT * -- [[hidden]]',
      '~~~',
      'more [[b]]',
    ].join('\n')
    expect(parseWikilinks(body)).toEqual([
      { targetSlug: 'a', displayText: null },
      { targetSlug: 'b', displayText: null },
    ])
  })

  it('does not parse wikilinks inside inline code spans', () => {
    expect(parseWikilinks('this `[[hidden]]` is code, but [[visible]] is not')).toEqual([
      { targetSlug: 'visible', displayText: null },
    ])
  })

  it('handles a mixed body in document order', () => {
    const body = [
      'first [[one]] is here',
      '```',
      '[[skip-fenced]]',
      '```',
      'between `[[skip-inline]]` and [[two|second-slug]] inline',
      'last [[three]]',
    ].join('\n')
    expect(parseWikilinks(body)).toEqual([
      { targetSlug: 'one', displayText: null },
      { targetSlug: 'second-slug', displayText: 'two' },
      { targetSlug: 'three', displayText: null },
    ])
  })

  it('parses multiple wikilinks on the same line in order', () => {
    expect(parseWikilinks('a [[one]] b [[two]] c [[three|3]] d')).toEqual([
      { targetSlug: 'one', displayText: null },
      { targetSlug: 'two', displayText: null },
      { targetSlug: '3', displayText: 'three' },
    ])
  })

  it('does not throw and returns no parses for malformed [[unclosed', () => {
    expect(() => parseWikilinks('text [[unclosed')).not.toThrow()
    expect(parseWikilinks('text [[unclosed')).toEqual([])
  })

  it('returns one entry per occurrence, preserving duplicates', () => {
    // De-duplication is the caller's job — the parser reports every match.
    expect(parseWikilinks('[[same]] then [[same]] again')).toEqual([
      { targetSlug: 'same', displayText: null },
      { targetSlug: 'same', displayText: null },
    ])
  })
})
