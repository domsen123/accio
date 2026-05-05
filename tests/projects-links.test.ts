import { describe, expect, it } from 'vitest'

import {
  formatGithubDevUrl,
  formatGithubRepoUrl,
} from '../app/features/projects/utils/links'

describe('formatGithubDevUrl', () => {
  it('builds github.dev URL for valid owner/name', () => {
    expect(formatGithubDevUrl('octocat', 'hello-world'))
      .toBe('https://github.dev/octocat/hello-world')
  })

  it('accepts dots and underscores in segments', () => {
    expect(formatGithubDevUrl('octo.cat', 'hello_world.42'))
      .toBe('https://github.dev/octo.cat/hello_world.42')
  })

  it('rejects path-traversal in owner', () => {
    expect(() => formatGithubDevUrl('../etc', 'repo')).toThrow()
  })

  it('rejects slashes in name', () => {
    expect(() => formatGithubDevUrl('octocat', 'hello/world')).toThrow()
  })

  it('rejects empty segments', () => {
    expect(() => formatGithubDevUrl('', 'repo')).toThrow()
    expect(() => formatGithubDevUrl('octocat', '')).toThrow()
  })

  it('rejects spaces and unicode garbage', () => {
    expect(() => formatGithubDevUrl('octo cat', 'repo')).toThrow()
    expect(() => formatGithubDevUrl('octocat', 'repo;rm')).toThrow()
  })
})

describe('formatGithubRepoUrl', () => {
  it('builds github.com URL for valid segments', () => {
    expect(formatGithubRepoUrl('octocat', 'hello-world'))
      .toBe('https://github.com/octocat/hello-world')
  })

  it('shares the same validation as the dev variant', () => {
    expect(() => formatGithubRepoUrl('a/b', 'c')).toThrow()
  })
})
