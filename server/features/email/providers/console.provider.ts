import type { EmailProvider, SendEmailParams, SendEmailResult } from '../email-provider.interface'

export const createConsoleEmailProvider = (): EmailProvider => {
  const send = async (params: SendEmailParams): Promise<SendEmailResult> => {
    const toAddresses = Array.isArray(params.to) ? params.to.join(', ') : params.to

    console.log(`\n${'='.repeat(80)}`)
    console.log('EMAIL (Console Provider)')
    console.log('='.repeat(80))
    console.log(`To: ${toAddresses}`)
    console.log(`Subject: ${params.subject}`)
    console.log(`From: ${params.from || 'noreply@example.com'}`)
    if (params.replyTo) {
      console.log(`Reply-To: ${params.replyTo}`)
    }
    console.log('\n--- Text Content ---')
    console.log(params.text)
    console.log(`${'='.repeat(80)}\n`)

    return {
      success: true,
      messageId: `console-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    }
  }

  return { send }
}
