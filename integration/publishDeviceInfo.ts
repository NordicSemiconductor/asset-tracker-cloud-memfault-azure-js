import { AzureFunction, Context } from '@azure/functions'
import { log, logError } from '../lib/log.js'
import { createMemfaultHardwareVersion } from './createMemfaultHardwareVersion.js'
import { updateMemfaultDeviceInfo } from './updateMemfaultDeviceInfo.js'

/**
 * Receives updates to the reported device information to provide it to Memfault's device information
 */
export const publishDeviceInfo: AzureFunction = async (
	context: Context,
	requests: Buffer[],
	deviceInfoPublisher: ReturnType<typeof updateMemfaultDeviceInfo>,
	hardwareVersionCreator: ReturnType<typeof createMemfaultHardwareVersion>,
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
		properties?: {
			reported?: {
				dev?: {
					v: {
						brdV: string
					}
				}
			}
		}
	}
	const nickname = update.tags?.name
	const hardware_version = update.properties?.reported?.dev?.v.brdV
	if (nickname === undefined && hardware_version === undefined) {
		log(context)(`Not updating nickname or hardware_version`, { update })
		return
	}

	const bindingProps: Record<string, any> =
		context.bindingData.propertiesArray?.[0]
	const systemProps: Record<string, any> =
		context.bindingData.systemPropertiesArray?.[0]
	const deviceId =
		bindingProps.deviceId ?? systemProps['iothub-connection-device-id']
	if (deviceId === undefined) {
		logError(context)(`Device ID not defined!`)
		return
	}

	log(context)({
		deviceId,
		update,
	})

	const { res, body } = await deviceInfoPublisher({
		device: deviceId,
		update: {
			nickname,
			hardware_version,
		},
		debug: log(context),
	})

	const statusCode = res.statusCode ?? 500
	if (statusCode === 200) return // all fine.

	if (
		hardware_version !== undefined &&
		(res.headers['content-type']?.includes('application/json') ?? false) &&
		(res.headers['content-length'] ?? 0) > 0
	) {
		let errorInfo: Record<string, any> | undefined = undefined
		try {
			errorInfo = JSON.parse(body)
		} catch {
			// parsing failed
			console.debug(`Failed to debug response body as JSON`, body)
		}
		if (
			errorInfo?.error?.code === 1003 &&
			/HardwareVersion with name `[^`]+` not found/.test(
				errorInfo?.error?.message ?? '',
			)
		) {
			// The hardware version we are trying to set needs to be created
			await hardwareVersionCreator({
				hardware_version,
			})
			// And send the update again
			await deviceInfoPublisher({
				device: deviceId,
				update: {
					nickname,
					hardware_version,
				},
			})
		}
	}
}
