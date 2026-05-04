import type { H3Event } from 'h3'
import { deleteCookie, getCookie, setCookie } from 'h3'
import config from '../../utils/config'

const COOKIE_NAME = 'auth_session'

const getCookieOptions = (maxAge?: number) => ({
  httpOnly: true,
  secure: config.site.env === 'production',
  sameSite: 'lax' as const,
  path: '/',
  ...(maxAge !== undefined && { maxAge }),
})

export const setSessionCookie = (event: H3Event, token: string, expiresAt: Date) => {
  const maxAge = Math.floor((expiresAt.getTime() - Date.now()) / 1000)
  setCookie(event, COOKIE_NAME, token, getCookieOptions(maxAge))
}

export const getSessionToken = (event: H3Event): string | undefined => {
  return getCookie(event, COOKIE_NAME)
}

export const clearSessionCookie = (event: H3Event) => {
  deleteCookie(event, COOKIE_NAME, getCookieOptions(0))
}
