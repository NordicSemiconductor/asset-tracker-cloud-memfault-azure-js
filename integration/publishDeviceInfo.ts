import { AzureFunction, Context } from '@azure/functions'
import { log, logError } from '../lib/log.js'
import { updateMemfaultDeviceInfo } from './updateMemfaultDeviceInfo.js'

/**
 * Receives updates to the reported device information to provide it to Memfault's device information
 */
export const publishDeviceInfo: AzureFunction = async (
	context: Context,
	requests: Buffer[],
	deviceInfoPublisher: ReturnType<typeof updateMemfaultDeviceInfo>,
): Promise<void> => {
	log(context)({
		context,
	})

	const updateRequest = requests?.[0]
	if (updateRequest === undefined) {
		log(context)(`No update found`, { requests: requests })
		return
	}
	const update = JSON.parse(updateRequest.toString('utf-8')) as {
		version: number
		tags?: { name?: string }
	}
	const nickname = update.tags?.name
	if (nickname === undefined) {
		log(context)(`Not updating name`, { update })
		return
	}

	const props: Record<string, any> = context.bindingData.propertiesArray?.[0]
	const deviceId = props.deviceId
	if (deviceId === undefined) {
		logError(context)(`Device ID not defined!`)
		return
	}

	log(context)({
		deviceId,
		update,
	})

	const { res } = await deviceInfoPublisher({
		device: deviceId,
		update: {
			nickname,
			// hardware_version,
		},
		debug: log(context),
	})

	const statusCode = res.statusCode ?? 500

	if (statusCode === 200) return // all fine.
}
