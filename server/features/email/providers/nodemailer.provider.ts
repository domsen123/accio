import type { EmailProvider, SendEmailParams, SendEmailResult } from '../email-provider.interface'
import nodemailer from 'nodemailer'

export interface NodemailerProviderConfig {
  host: string
  port: number
  secure?: boolean
  user?: string
  pass?: string
  from: string
}

export const createNodemailerProvider = (config: NodemailerProviderConfig): EmailProvider => {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure ?? config.port === 465,
    auth: config.user && config.pass
      ? {
          user: config.user,
          pass: config.pass,
        }
      : undefined,
  })

  const send = async (params: SendEmailParams): Promise<SendEmailResult> => {
    try {
      const info = await transporter.sendMail({
        from: params.from || config.from,
        to: params.to,
        replyTo: params.replyTo,
        subject: params.subject,
        text: params.text,
        html: params.html,
      })

      return {
        success: true,
        messageId: info.messageId,
      }
    }
    catch (error) {
      console.error('[Email] Failed to send email:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  return { send }
}
