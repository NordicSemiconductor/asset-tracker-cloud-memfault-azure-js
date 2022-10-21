import { AzureFunction, Context } from '@azure/functions'
import { log, logError } from '../lib/log.js'
import { publishMemfaultChunks } from './publishMemfaultChunks.js'

/**
 * Publishes Memfault chunk messages to the chunks API.
 */
export const publishChunks: AzureFunction = async (
	context: Context,
	requests: Buffer[],
	chunkPublisher: ReturnType<typeof publishMemfaultChunks>,
): Promise<void> => {
	log(context)({
		context,
	})

	const props: Record<string, any> =
		context.bindingData.systemPropertiesArray?.[0]
	const deviceId = props['iothub-connection-device-id']
	if (deviceId === undefined) {
		logError(context)(`Device ID not defined!`)
		return
	}

	log(context)({
		requests: requests.map((request) => ({
			deviceId,
			chunkLength: request.length,
		})),
	})

	await Promise.all(
		requests.map((chunk) => {
			if (chunk.length === 0) {
				console.error(`Chunk is empty.`)
				return
			}
			return chunkPublisher({
				chunk,
				device: deviceId,
				debug: log(context),
			})
		}),
	)
}
