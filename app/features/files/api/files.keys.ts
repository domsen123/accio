export const filesKeys = {
  all: ['files'] as const,
  entity: (entityType: string, entityId: string) =>
    [...filesKeys.all, 'entity', entityType, entityId] as const,
  detail: (id: string) =>
    [...filesKeys.all, 'detail', id] as const,
}
