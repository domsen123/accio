import { container } from '~~/server/utils/container'

export default defineTask({
  meta: {
    name: 'content-creator:generate',
    description: 'Process the next item in the content creator production queue',
  },
  async run() {
    const settings = await container.contentCreatorService.getSettings()

    if (!settings || !settings.productionEnabled) {
      console.log('[content-creator:generate] Skipped: Production not enabled')
      return { result: {} }
    }

    const result = await container.contentCreatorService.processNextInQueue()

    console.log('[content-creator:generate] Result:', result)

    return { result: {} }
  },
})
