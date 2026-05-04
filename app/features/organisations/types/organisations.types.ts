export interface Organisation {
  id: string
  name: string
  slug: string
  createdAt: string
  updatedAt: string
}

export interface OrganisationOwner {
  id: string
  email: string
  name: string | null
}

export interface OrganisationWithOwner extends Organisation {
  owner: OrganisationOwner
}

// API Responses
export interface OrganisationResponse {
  organisation: Organisation
}

export interface OrganisationWithOwnerResponse {
  organisation: OrganisationWithOwner
}

export interface OrganisationsResponse {
  organisations: Organisation[]
  total: number
}

// API Inputs
export interface CreateOrganisationInput {
  name: string
  slug: string
}
