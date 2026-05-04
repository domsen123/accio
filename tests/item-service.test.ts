import { faker } from '@faker-js/faker'
import { describe, expect, it } from 'vitest'

import * as schema from '../server/database/schema'
import { getDatabase } from '../server/infrastructure/database/client'
import { createItemService } from '../server/infrastructure/database/item-service'

import { createOrganisationData, createTeamData, createTeamMemberData, createUserData } from './factories'

describe('itemService', () => {
  const db = getDatabase('app')
  const organisationsService = createItemService({ db, table: schema.organisations, tableName: 'organisations' })
  const usersService = createItemService({ db, table: schema.users, tableName: 'users' })
  const teamsService = createItemService({ db, table: schema.teams, tableName: 'teams' })
  const teamMembersService = createItemService({ db, table: schema.teamMembers, tableName: 'teamMembers' })

  describe('create', () => {
    it('creates a record with auto-generated id and timestamps', async () => {
      const data = createOrganisationData()
      const org = await organisationsService.create(data)

      expect(org.id).toBeDefined()
      expect(org.name).toBe(data.name)
      expect(org.slug).toBe(data.slug)
      expect(org.createdAt).toBeInstanceOf(Date)
      expect(org.updatedAt).toBeInstanceOf(Date)
    })
  })

  describe('createMany', () => {
    it('creates multiple records', async () => {
      const dataArray = Array.from({ length: 5 }, () => createOrganisationData())
      const orgs = await organisationsService.createMany(dataArray)

      expect(orgs).toHaveLength(5)
      orgs.forEach((org, i) => {
        expect(org.name).toBe(dataArray[i].name)
      })
    })
  })

  describe('findMany', () => {
    it('returns all records', async () => {
      await organisationsService.createMany([
        createOrganisationData(),
        createOrganisationData(),
      ])

      const orgs = await organisationsService.findMany()
      expect(orgs).toHaveLength(2)
    })

    it('supports limit and offset', async () => {
      await organisationsService.createMany(
        Array.from({ length: 5 }, () => createOrganisationData()),
      )

      const page1 = await organisationsService.findMany({ limit: 2 })
      expect(page1).toHaveLength(2)

      const page2 = await organisationsService.findMany({ limit: 2, offset: 2 })
      expect(page2).toHaveLength(2)

      const page3 = await organisationsService.findMany({ limit: 2, offset: 4 })
      expect(page3).toHaveLength(1)
    })
  })

  describe('findMany with filters', () => {
    it('filters with _eq', async () => {
      const targetSlug = 'target-org'
      await organisationsService.create(createOrganisationData({ slug: targetSlug }))
      await organisationsService.create(createOrganisationData())

      const result = await organisationsService.findMany({
        filter: { slug: { _eq: targetSlug } },
      })
      expect(result).toHaveLength(1)
      expect(result[0].slug).toBe(targetSlug)
    })

    it('filters with _ilike', async () => {
      await organisationsService.create(createOrganisationData({ name: 'Acme Corporation' }))
      await organisationsService.create(createOrganisationData({ name: 'Beta Inc' }))

      const result = await organisationsService.findMany({
        filter: { name: { _ilike: '%corp%' } },
      })
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Acme Corporation')
    })

    it('filters with _in', async () => {
      const orgs = await organisationsService.createMany([
        createOrganisationData(),
        createOrganisationData(),
        createOrganisationData(),
      ])

      const result = await organisationsService.findMany({
        filter: { id: { _in: [orgs[0].id, orgs[1].id] } },
      })
      expect(result).toHaveLength(2)
    })

    it('filters with _or', async () => {
      await organisationsService.create(createOrganisationData({ slug: 'acme' }))
      await organisationsService.create(createOrganisationData({ slug: 'beta' }))
      await organisationsService.create(createOrganisationData({ slug: 'gamma' }))

      const result = await organisationsService.findMany({
        filter: {
          _or: [
            { slug: 'acme' },
            { slug: 'beta' },
          ],
        },
      })
      expect(result).toHaveLength(2)
    })

    it('filters with nested _and and _or', async () => {
      await usersService.create(createUserData({ email: 'admin@acme.com', emailVerified: true }))
      await usersService.create(createUserData({ email: 'user@acme.com', emailVerified: false }))
      await usersService.create(createUserData({ email: 'admin@beta.com', emailVerified: true }))

      const result = await usersService.findMany({
        filter: {
          _and: [
            { emailVerified: true },
            { email: { _ilike: '%acme%' } },
          ],
        },
      })
      expect(result).toHaveLength(1)
      expect(result[0].email).toBe('admin@acme.com')
    })
  })

  describe('readOne', () => {
    it('returns record by id', async () => {
      const created = await organisationsService.create(createOrganisationData())
      const found = await organisationsService.readOne(created.id)

      expect(found).not.toBeNull()
      expect(found?.id).toBe(created.id)
    })

    it('returns null for non-existent id', async () => {
      const found = await organisationsService.readOne('non-existent-id')
      expect(found).toBeNull()
    })
  })

  describe('findOne', () => {
    it('returns first matching record by filter', async () => {
      const targetSlug = 'unique-target'
      await organisationsService.create(createOrganisationData({ slug: targetSlug }))
      await organisationsService.create(createOrganisationData())

      const found = await organisationsService.findOne({ slug: targetSlug })
      expect(found).not.toBeNull()
      expect(found?.slug).toBe(targetSlug)
    })

    it('returns null when no match found', async () => {
      await organisationsService.create(createOrganisationData())
      const found = await organisationsService.findOne({ slug: 'non-existent' })
      expect(found).toBeNull()
    })

    it('supports filter operators', async () => {
      await organisationsService.create(createOrganisationData({ name: 'Acme Corp' }))
      const found = await organisationsService.findOne({ name: { _ilike: '%acme%' } })
      expect(found).not.toBeNull()
      expect(found?.name).toBe('Acme Corp')
    })
  })

  describe('update', () => {
    it('updates record and returns updated data', async () => {
      const created = await organisationsService.create(createOrganisationData())
      const newName = faker.company.name()

      // Small delay to ensure timestamp difference
      await new Promise(r => setTimeout(r, 10))

      const updated = await organisationsService.update(created.id, { name: newName })

      expect(updated.name).toBe(newName)
      expect(updated.updatedAt.getTime()).toBeGreaterThan(created.updatedAt.getTime())
    })
  })

  describe('delete', () => {
    it('deletes record and returns deleted data', async () => {
      const created = await organisationsService.create(createOrganisationData())
      const deleted = await organisationsService.delete(created.id)

      expect(deleted.id).toBe(created.id)

      const found = await organisationsService.readOne(created.id)
      expect(found).toBeNull()
    })
  })

  describe('count', () => {
    it('counts all records', async () => {
      await organisationsService.createMany([
        createOrganisationData(),
        createOrganisationData(),
        createOrganisationData(),
      ])

      const total = await organisationsService.count()
      expect(total).toBe(3)
    })

    it('counts with filter', async () => {
      await organisationsService.create(createOrganisationData({ slug: 'acme' }))
      await organisationsService.create(createOrganisationData({ slug: 'beta' }))

      const count = await organisationsService.count({ slug: 'acme' })
      expect(count).toBe(1)
    })
  })

  describe('relations (teams)', () => {
    it('creates teams for an organisation', async () => {
      const org = await organisationsService.create(createOrganisationData())

      const teams = await teamsService.createMany([
        createTeamData(org.id),
        createTeamData(org.id),
      ])

      expect(teams).toHaveLength(2)
      teams.forEach((team) => {
        expect(team.organisationId).toBe(org.id)
      })
    })

    it('cascades delete from organisation to teams', async () => {
      const org = await organisationsService.create(createOrganisationData())
      await teamsService.createMany([
        createTeamData(org.id),
        createTeamData(org.id),
      ])

      await organisationsService.delete(org.id)

      const remainingTeams = await teamsService.findMany({
        filter: { organisationId: org.id },
      })
      expect(remainingTeams).toHaveLength(0)
    })
  })

  describe('findMany with fields', () => {
    it('selects specific fields with include', async () => {
      const data = createOrganisationData()
      const org = await organisationsService.create(data)

      const [result] = await organisationsService.findMany({
        fields: ['id', 'name'],
        filter: { id: org.id },
      })

      expect(result.id).toBe(org.id)
      expect(result.name).toBe(data.name)
      expect(result).not.toHaveProperty('slug')
      expect(result).not.toHaveProperty('createdAt')
      expect(result).not.toHaveProperty('updatedAt')
    })

    it('excludes fields with - prefix', async () => {
      const data = createOrganisationData()
      const org = await organisationsService.create(data)

      const [result] = await organisationsService.findMany({
        fields: ['-createdAt', '-updatedAt'],
        filter: { id: org.id },
      })

      expect(result.id).toBe(org.id)
      expect(result.name).toBe(data.name)
      expect(result.slug).toBe(data.slug)
      expect(result).not.toHaveProperty('createdAt')
      expect(result).not.toHaveProperty('updatedAt')
    })

    it('returns all fields when fields is empty array', async () => {
      const data = createOrganisationData()
      const org = await organisationsService.create(data)

      const [result] = await organisationsService.findMany({
        fields: [],
        filter: { id: org.id },
      })

      expect(result.id).toBe(org.id)
      expect(result.name).toBe(data.name)
      expect(result.slug).toBe(data.slug)
      expect(result.createdAt).toBeInstanceOf(Date)
      expect(result.updatedAt).toBeInstanceOf(Date)
    })

    it('returns all fields when fields is not provided', async () => {
      const data = createOrganisationData()
      const org = await organisationsService.create(data)

      const [result] = await organisationsService.findMany({
        filter: { id: org.id },
      })

      expect(result.id).toBe(org.id)
      expect(result.name).toBe(data.name)
      expect(result.slug).toBe(data.slug)
      expect(result.createdAt).toBeInstanceOf(Date)
      expect(result.updatedAt).toBeInstanceOf(Date)
    })

    it('combines fields with filter and pagination', async () => {
      const orgs = await organisationsService.createMany([
        createOrganisationData({ slug: 'alpha' }),
        createOrganisationData({ slug: 'beta' }),
        createOrganisationData({ slug: 'gamma' }),
      ])

      const results = await organisationsService.findMany({
        fields: ['id', 'slug'],
        filter: { id: { _in: orgs.map(o => o.id) } },
        limit: 2,
      })

      expect(results).toHaveLength(2)
      results.forEach((result) => {
        expect(result).toHaveProperty('id')
        expect(result).toHaveProperty('slug')
        expect(result).not.toHaveProperty('name')
        expect(result).not.toHaveProperty('createdAt')
      })
    })

    it('ignores invalid field names', async () => {
      const data = createOrganisationData()
      const org = await organisationsService.create(data)

      const [result] = await organisationsService.findMany({
        fields: ['id', 'nonExistentField'],
        filter: { id: org.id },
      })

      expect(result.id).toBe(org.id)
      expect(result).not.toHaveProperty('nonExistentField')
      expect(result).not.toHaveProperty('name')
    })
  })

  describe('findMany with relations', () => {
    it('fetches relation with specific fields', async () => {
      const orgData = createOrganisationData()
      const org = await organisationsService.create(orgData)
      const teamData = createTeamData(org.id)
      const team = await teamsService.create(teamData)

      const [result] = await teamsService.findMany({
        fields: ['id', 'name', 'organisation.name', 'organisation.slug'],
        filter: { id: team.id },
      }) as any[]

      expect(result.id).toBe(team.id)
      expect(result.name).toBe(teamData.name)
      expect(result.organisation).toBeDefined()
      expect(result.organisation.name).toBe(orgData.name)
      expect(result.organisation.slug).toBe(orgData.slug)
      expect(result.organisation).not.toHaveProperty('id')
      expect(result.organisation).not.toHaveProperty('createdAt')
    })

    it('fetches relation with wildcard (*)', async () => {
      const orgData = createOrganisationData()
      const org = await organisationsService.create(orgData)
      const team = await teamsService.create(createTeamData(org.id))

      const [result] = await teamsService.findMany({
        fields: ['id', 'organisation.*'],
        filter: { id: team.id },
      }) as any[]

      expect(result.id).toBe(team.id)
      expect(result).not.toHaveProperty('name') // Only id was requested for team
      expect(result.organisation.id).toBe(org.id)
      expect(result.organisation.name).toBe(orgData.name)
      expect(result.organisation.slug).toBe(orgData.slug)
      expect(result.organisation.createdAt).toBeInstanceOf(Date)
      expect(result.organisation.updatedAt).toBeInstanceOf(Date)
    })

    it('fetches nested relations (multi-level)', async () => {
      const userData = createUserData()
      const user = await usersService.create(userData)
      const org = await organisationsService.create(createOrganisationData())
      const team = await teamsService.create(createTeamData(org.id))
      await teamMembersService.create(createTeamMemberData(team.id, user.id))

      const [result] = await teamsService.findMany({
        fields: ['id', 'name', 'members.user.name', 'members.user.email'],
        filter: { id: team.id },
      }) as any[]

      expect(result.id).toBe(team.id)
      expect(result.members).toHaveLength(1)
      expect(result.members[0].user.name).toBe(userData.name)
      expect(result.members[0].user.email).toBe(userData.email)
      expect(result.members[0].user).not.toHaveProperty('id')
      expect(result.members[0].user).not.toHaveProperty('passwordHash')
    })

    it('combines relation fields with filter and pagination', async () => {
      const orgData = createOrganisationData()
      const org = await organisationsService.create(orgData)
      await teamsService.createMany([
        createTeamData(org.id),
        createTeamData(org.id),
        createTeamData(org.id),
      ])

      const results = await teamsService.findMany({
        fields: ['id', 'name', 'organisation.name'],
        filter: { organisationId: org.id },
        limit: 2,
      }) as any[]

      expect(results).toHaveLength(2)
      results.forEach((result) => {
        expect(result.organisation.name).toBe(orgData.name)
      })
    })

    it('falls back to standard query when no relations requested', async () => {
      const org = await organisationsService.create(createOrganisationData())
      const team = await teamsService.create(createTeamData(org.id))

      // Without relation fields, should use standard query (no organisation property)
      const [result] = await teamsService.findMany({
        fields: ['id', 'name'],
        filter: { id: team.id },
      })

      expect(result.id).toBe(team.id)
      expect(result).not.toHaveProperty('organisation')
    })
  })
})
