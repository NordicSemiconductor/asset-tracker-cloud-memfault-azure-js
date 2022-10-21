import { AzureFunction, Context } from '@azure/functions'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { memfaultConfig } from '../lib/config.js'
import { log } from '../lib/log.js'
import { publishChunks } from './publishChunks.js'
import { publishDeviceInfo } from './publishDeviceInfo.js'
import { publishMemfaultChunks } from './publishMemfaultChunks.js'
import { updateMemfaultDeviceInfo } from './updateMemfaultDeviceInfo.js'

const { keyVaultName } = fromEnv({
	keyVaultName: 'KEYVAULT_NAME',
})(process.env)

const memfaultConfigPromise = memfaultConfig({ keyVaultName })

// Prepare API client
const chunkPublisher = (async () =>
	publishMemfaultChunks(await memfaultConfigPromise))()

const deviceInfoPublisher = (async () =>
	updateMemfaultDeviceInfo(await memfaultConfigPromise))()

const handler: AzureFunction = async (
	context: Context,
	requests: Buffer[],
): Promise<void> => {
	log(context)({
		context,
	})

	const props: Record<string, any> = context.bindingData.propertiesArray?.[0]

	// Check if sent with 'memfault' property
	if ('memfault' in props) {
		await publishChunks(context, requests, await chunkPublisher)
		return
	}

	// Check if it is a Twin update to the name tag
	if (props['iothub-message-schema'] === 'twinChangeNotification') {
		await publishDeviceInfo(context, requests, await deviceInfoPublisher)
		return
	}
	log(context)(`Unmatched request`, { props })
}

export default handler
