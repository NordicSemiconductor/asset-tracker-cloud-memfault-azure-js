import { DefaultAzureCredential } from '@azure/identity'
import { SecretClient } from '@azure/keyvault-secrets'

export const memfaultConfig = async ({
	keyVaultName,
}: {
	keyVaultName: string
}): Promise<{
	projectKey: string
	organization: string
	project: string
	authToken: string
	apiEndpoint?: string
	chunksEndpoint?: string
}> => {
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
}
