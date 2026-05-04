export interface SendEmailParams {
  to: string | string[]
  subject: string
  html: string
  text: string
  from?: string
  replyTo?: string
}

export interface SendEmailResult {
  success: boolean
  messageId?: string
  error?: string
}

export interface EmailProvider {
  send: (params: SendEmailParams) => Promise<SendEmailResult>
}
