export const organisationsKeys = {
  all: ['organisations'] as const,
  list: () => [...organisationsKeys.all, 'list'] as const,
  detail: (id: string) => [...organisationsKeys.all, 'detail', id] as const,
}
