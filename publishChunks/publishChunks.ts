import { AzureFunction, Context } from '@azure/functions'
import { DefaultAzureCredential } from '@azure/identity'
import { SecretClient } from '@azure/keyvault-secrets'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { log } from '../lib/log.js'
import { publishMemfaultChunks } from './publishMemfaultChunks.js'

const config = () =>
	fromEnv({
		keyVaultName: 'KEYVAULT_NAME',
	})(process.env)

const memfaultConfigPromise: Promise<{
	projectKey: string
	organization: string
	project: string
	authToken: string
	apiEndpoint?: string
	chunksEndpoint?: string
}> = (async () => {
	const { keyVaultName } = config()
	const credentials = new DefaultAzureCredential()
	const keyVaultClient = new SecretClient(
		`https://${keyVaultName}.vault.azure.net`,
		credentials,
	)
	const [
		memfaultProjectKey,
		memfaultOrganization,
		memfaultProject,
		memfaultAuthToken,
		memfaultApiEndpoint,
		memfaultChunksEndpoint,
	] = await Promise.all(
		[
			'memfaultProjectKey',
			'memfaultOrganization',
			'memfaultProject',
			'memfaultAuthToken',
			'memfaultApiEndpoint',
			'memfaultChunksEndpoint',
		].map(async (secret) => keyVaultClient.getSecret(secret)),
	)
	return {
		projectKey: memfaultProjectKey.value as string,
		organization: memfaultOrganization.value as string,
		project: memfaultProject.value as string,
		authToken: memfaultAuthToken.value as string,
		apiEndpoint: memfaultApiEndpoint.value,
		chunksEndpoint: memfaultChunksEndpoint.value,
	}
})()

// Prepare API client
const chunkPublisher = (async () =>
	publishMemfaultChunks(await memfaultConfigPromise))()

/**
 * Publishes Memfault chunk messages to the chunks API.
 */
const publishChunksHandler: AzureFunction = async (
	context: Context,
	requests: Buffer[],
): Promise<void> => {
	const deviceId =
		context.bindingData.systemPropertiesArray['iothub-connection-device-id']
	log(context)({
		config: await memfaultConfigPromise,
		requests: requests.map((request) => ({
			deviceId,
			chunkLength: request.length,
		})),
	})

	const c = await chunkPublisher

	await Promise.all(
		requests.map((chunk) => {
			if (chunk.length === 0) {
				console.error(`Chunk is empty.`)
				return
			}
			return c({
				chunk,
				device: deviceId,
				debug: log(context),
			})
		}),
	)
}

export default publishChunksHandler
