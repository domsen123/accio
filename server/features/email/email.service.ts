import type { Config } from '../../utils/config'
import type { EmailProvider } from './email-provider.interface'
import type { EmailChangeTemplateData, EmailVerificationTemplateData, OrganisationInvitationTemplateData, PasswordResetTemplateData } from './templates'
import { emailChangeTemplate, emailVerificationTemplate, organisationInvitationTemplate, passwordResetTemplate } from './templates'

export interface CreateEmailServiceDeps {
  provider: EmailProvider
  config: Config
}

export const createEmailService = ({ provider, config }: CreateEmailServiceDeps) => {
  const getDefaultFrom = () => {
    try {
      const hostname = new URL(config.site.url).hostname
      return `${config.site.name} <noreply@${hostname}>`
    }
    catch {
      return `${config.site.name} <noreply@example.com>`
    }
  }

  const sendPasswordReset = async (
    to: string,
    data: Omit<PasswordResetTemplateData, 'siteName'>,
  ) => {
    const template = await passwordResetTemplate({
      ...data,
      siteName: config.site.name,
    })

    return provider.send({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
      from: getDefaultFrom(),
    })
  }

  const sendEmailVerification = async (
    to: string,
    data: Omit<EmailVerificationTemplateData, 'siteName'>,
  ) => {
    const template = await emailVerificationTemplate({
      ...data,
      siteName: config.site.name,
    })

    return provider.send({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
      from: getDefaultFrom(),
    })
  }

  const sendEmailChangeConfirmation = async (
    to: string,
    data: Omit<EmailChangeTemplateData, 'siteName'>,
  ) => {
    const template = await emailChangeTemplate({
      ...data,
      siteName: config.site.name,
    })

    return provider.send({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
      from: getDefaultFrom(),
    })
  }

  const sendOrganisationInvitation = async (
    to: string,
    data: Omit<OrganisationInvitationTemplateData, 'siteName'>,
  ) => {
    const template = await organisationInvitationTemplate({
      ...data,
      siteName: config.site.name,
    })

    return provider.send({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
      from: getDefaultFrom(),
    })
  }

  return {
    sendPasswordReset,
    sendEmailVerification,
    sendEmailChangeConfirmation,
    sendOrganisationInvitation,
  }
}

export type EmailService = ReturnType<typeof createEmailService>
