export interface CreateOrganisationInput {
  name: string
  slug: string
  creatorUserId: string
}

export interface OrganisationWithOwner {
  id: string
  name: string
  slug: string
  createdAt: Date
  updatedAt: Date
  owner: {
    id: string
    email: string | null
    name: string | null
  }
}
