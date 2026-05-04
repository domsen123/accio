import { faker } from '@faker-js/faker'

export const createOrganisationData = (overrides = {}) => ({
  name: faker.company.name(),
  slug: faker.helpers.slugify(faker.company.name()).toLowerCase(),
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
