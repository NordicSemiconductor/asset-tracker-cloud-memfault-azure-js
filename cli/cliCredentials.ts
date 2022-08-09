import { SubscriptionClient } from '@azure/arm-resources-subscriptions'
import { AzureCliCredential } from '@azure/identity'

export const cliCredentials = async (): Promise<{
	credentials: AzureCliCredential
	subscriptionId: string
}> => {
	const credentials = new AzureCliCredential()
	const subscriptionClient = new SubscriptionClient(credentials)

	let subscriptionId: string | undefined = undefined

	for await (const subscription of subscriptionClient.subscriptions.list()) {
		if (subscription.id !== undefined)
			subscriptionId = subscription.subscriptionId
	}

	if (subscriptionId === undefined)
		throw new Error(`Failed to determine subscription ID!`)

	return { credentials, subscriptionId }
}
