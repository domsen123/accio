import type { Session, User } from '../database/schema'

export interface ImpersonationContext {
  originalUserId: string
  originalSessionId: string | null
}

declare module 'h3' {
  interface H3EventContext {
    session: Session | null
    user: Omit<User, 'passwordHash'> | null
    impersonation: ImpersonationContext | null
  }
}
