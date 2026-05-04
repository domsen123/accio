// KB-specific error classes.
//
// `KbSlugConflictError` is thrown by `kbEntryService.create` when the derived
// slug collides with an existing entry in the same workspace. T-1.3 will add
// transparent suffixing so callers do not see this error in normal use; until
// then API/UI callers should surface it as a "title already taken" message.
export class KbSlugConflictError extends Error {
  readonly organisationId: string
  readonly slug: string

  constructor(organisationId: string, slug: string) {
    super(`KB entry slug "${slug}" already exists in organisation ${organisationId}`)
    this.name = 'KbSlugConflictError'
    this.organisationId = organisationId
    this.slug = slug
  }
}
