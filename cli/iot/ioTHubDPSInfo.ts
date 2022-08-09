import { IotDpsClient } from '@azure/arm-deviceprovisioningservices'
import { IotHubClient } from '@azure/arm-iothub'
import { AzureCliCredential } from '@azure/identity'

export const globalIotHubDPSHostname = 'global.azure-devices-provisioning.net'

export const ioTHubDPSInfo =
	({
		resourceGroupName,
		credentials,
		dpsName,
		iotHubName,
	}: {
		resourceGroupName: string
		dpsName: string
		iotHubName: string
		credentials:
			| {
					credentials: AzureCliCredential
					subscriptionId: string
			  }
			| (() => Promise<{
					credentials: AzureCliCredential
					subscriptionId: string
			  }>)
	}) =>
	async (): Promise<{
		hostname: string
		connectionString: string
	}> => {
		const creds =
			typeof credentials === 'function' ? await credentials() : credentials

		const armIotDpsClient = new IotDpsClient(
			creds.credentials,
			creds.subscriptionId,
		)
		const armIotHubClient = new IotHubClient(
			creds.credentials,
			creds.subscriptionId,
		)

		const [keys, dpsInfo, iotHubInfo] = await Promise.all([
			armIotDpsClient.iotDpsResource.listKeys(dpsName, resourceGroupName),
			armIotDpsClient.iotDpsResource.get(dpsName, resourceGroupName),
			armIotHubClient.iotHubResource.get(resourceGroupName, iotHubName),
		])

		let primaryKey: string | undefined = undefined

		for await (const key of keys) {
			primaryKey = key.primaryKey
			break
		}

		return {
			hostname: iotHubInfo.properties?.hostName as string,
			connectionString: `HostName=${dpsInfo.properties.serviceOperationsHostName};SharedAccessKeyName=provisioningserviceowner;SharedAccessKey=${primaryKey}`,
		}
	}
