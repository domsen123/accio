import { faker } from '@faker-js/faker'

export const createOrganisationData = (overrides = {}) => ({
  name: faker.company.name(),
  slug: faker.helpers.slugify(faker.company.name()).toLowerCase(),
  // organisations.crypto_salt is NOT NULL with no default (DESIGN-CRYPTO).
  // The real organisationsService.create generates this; tests that bypass
  // the service layer (item-service, event-bus) need a stable test value.
  cryptoSalt: faker.string.hexadecimal({ length: 32, casing: 'lower', prefix: '' }),
  ...overrides,
})

export const createTeamData = (organisationId: string, overrides = {}) => ({
  name: faker.commerce.department(),
  organisationId,
  ...overrides,
})

export const createUserData = (overrides = {}) => ({
  email: faker.internet.email(),
  passwordHash: faker.string.alphanumeric(60),
  name: faker.person.fullName(),
  emailVerified: faker.datatype.boolean(),
  ...overrides,
})

export const createOrganisationMemberData = (organisationId: string, userId: string, overrides = {}) => ({
  organisationId,
  userId,
  ...overrides,
})

export const createTeamMemberData = (teamId: string, userId: string, overrides = {}) => ({
  teamId,
  userId,
  ...overrides,
})

// --- KB factories (T-1.2) ---

export const createKbCategoryData = (organisationId: string, overrides = {}) => {
  const name = faker.commerce.department()
  return {
    organisationId,
    name,
    slug: faker.helpers.slugify(`${name}-${faker.string.alphanumeric(6)}`).toLowerCase(),
    ...overrides,
  }
}

export const createKbTagData = (organisationId: string, overrides = {}) => ({
  organisationId,
  name: faker.lorem.word(),
  ...overrides,
})

export const createKbEntryData = (organisationId: string, overrides: Record<string, unknown> = {}) => {
  const title = faker.lorem.sentence({ min: 2, max: 4 })
  const slug = faker.helpers.slugify(`${title}-${faker.string.alphanumeric(6)}`).toLowerCase()
  return {
    organisationId,
    title,
    slug,
    bodyMd: faker.lorem.paragraphs(2),
    status: 'draft' as const,
    authorType: 'human' as const,
    authorName: '',
    sourceType: 'manual' as const,
    ...overrides,
  }
}
