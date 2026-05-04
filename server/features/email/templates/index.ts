import type { Storage } from 'unstorage'
import { Buffer } from 'node:buffer'
import { Liquid } from 'liquidjs'

const engine = new Liquid()

const readTemplate = async (storage: Storage, path: string): Promise<string | null> => {
  const raw = await storage.getItemRaw(path)
  if (raw === null || raw === undefined)
    return null
  if (typeof raw === 'string')
    return raw
  if (Buffer.isBuffer(raw))
    return raw.toString('utf-8')
  return new TextDecoder().decode(raw as ArrayBufferLike)
}

export interface PasswordResetTemplateData {
  userName?: string
  resetLink: string
  expiresInHours: number
  siteName: string
}

export interface EmailVerificationTemplateData {
  userName?: string
  verificationLink: string
  expiresInHours: number
  siteName: string
}

export interface EmailChangeTemplateData {
  userName?: string
  confirmationLink: string
  expiresInHours: number
  siteName: string
}

export interface OrganisationInvitationTemplateData {
  organisationName: string
  inviterName?: string
  acceptLink: string
  expiresInDays: number
  siteName: string
}

export const passwordResetTemplate = async (data: PasswordResetTemplateData) => {
  const storage = useStorage('assets:server')

  const [htmlTemplate, txtTemplate] = await Promise.all([
    readTemplate(storage, 'templates/password-reset.html.liquid'),
    readTemplate(storage, 'templates/password-reset.txt.liquid'),
  ])

  if (!htmlTemplate || !txtTemplate) {
    throw new Error('Email templates not found')
  }

  const templateData = {
    ...data,
    year: new Date().getFullYear(),
  }

  const [html, text] = await Promise.all([
    engine.parseAndRender(htmlTemplate, templateData),
    engine.parseAndRender(txtTemplate, templateData),
  ])

  return {
    subject: `Reset your password - ${data.siteName}`,
    html,
    text,
  }
}

export const emailVerificationTemplate = async (data: EmailVerificationTemplateData) => {
  const storage = useStorage('assets:server')

  const [htmlTemplate, txtTemplate] = await Promise.all([
    readTemplate(storage, 'templates/email-verification.html.liquid'),
    readTemplate(storage, 'templates/email-verification.txt.liquid'),
  ])

  if (!htmlTemplate || !txtTemplate) {
    throw new Error('Email verification templates not found')
  }

  const templateData = {
    ...data,
    year: new Date().getFullYear(),
  }

  const [html, text] = await Promise.all([
    engine.parseAndRender(htmlTemplate, templateData),
    engine.parseAndRender(txtTemplate, templateData),
  ])

  return {
    subject: `Verify your email - ${data.siteName}`,
    html,
    text,
  }
}

export const emailChangeTemplate = async (data: EmailChangeTemplateData) => {
  const storage = useStorage('assets:server')

  const [htmlTemplate, txtTemplate] = await Promise.all([
    readTemplate(storage, 'templates/email-change.html.liquid'),
    readTemplate(storage, 'templates/email-change.txt.liquid'),
  ])

  if (!htmlTemplate || !txtTemplate) {
    throw new Error('Email change templates not found')
  }

  const templateData = {
    ...data,
    year: new Date().getFullYear(),
  }

  const [html, text] = await Promise.all([
    engine.parseAndRender(htmlTemplate, templateData),
    engine.parseAndRender(txtTemplate, templateData),
  ])

  return {
    subject: `Confirm your email change - ${data.siteName}`,
    html,
    text,
  }
}

export const organisationInvitationTemplate = async (data: OrganisationInvitationTemplateData) => {
  const storage = useStorage('assets:server')

  const [htmlTemplate, txtTemplate] = await Promise.all([
    readTemplate(storage, 'templates/organisation-invitation.html.liquid'),
    readTemplate(storage, 'templates/organisation-invitation.txt.liquid'),
  ])

  if (!htmlTemplate || !txtTemplate) {
    throw new Error('Organisation invitation templates not found')
  }

  const templateData = {
    ...data,
    year: new Date().getFullYear(),
  }

  const [html, text] = await Promise.all([
    engine.parseAndRender(htmlTemplate, templateData),
    engine.parseAndRender(txtTemplate, templateData),
  ])

  return {
    subject: `You've been invited to join ${data.organisationName} - ${data.siteName}`,
    html,
    text,
  }
}
