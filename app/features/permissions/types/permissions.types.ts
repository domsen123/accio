export interface PermissionsResponse {
  userId: string
  global: string[]
  organisations: Record<string, string[]>
  teams: Record<string, string[]>
}
