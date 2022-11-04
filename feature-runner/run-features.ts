import { WebSiteManagementClient } from '@azure/arm-appservice'
import { IotHubClient } from '@azure/arm-iothub'
import { AzureNamedKeyCredential } from '@azure/core-auth'
import { TableClient } from '@azure/data-tables'
import { consoleReporter, runFolder } from '@nordicsemiconductor/bdd-markdown'
import { fromEnv } from '@nordicsemiconductor/from-env'
import iothub from 'azure-iothub'
import chalk from 'chalk'
import { writeFile } from 'node:fs/promises'
import path from 'path'
import { cliCredentials } from '../cli/cliCredentials.js'
import { progress as logProgress } from '../cli/logging'
import { error, heading, settings } from '../cli/logging.js'
import { run } from '../cli/run.js'
import { deviceStepRunners } from './steps/device.js'
import { httpApiMockStepRunners } from './steps/httpApiMock.js'
const { Registry } = iothub

const {
	resourceGroup,
	iotHubName,
	mockAPIStorageAccountName,
	mockAPIResourceGroup,
	mockAPIAppName,
} = fromEnv({
	resourceGroup: 'RESOURCE_GROUP',
	iotHubName: 'IOT_HUB_NAME',
	mockAPIStorageAccountName: 'MOCK_API_STORAGE_ACCOUNT_NAME',
	mockAPIResourceGroup: 'MOCK_API_RESOURCE_GROUP',
	mockAPIAppName: 'MOCK_API_APP_NAME',
})({
	MOCK_API_STORAGE_ACCOUNT_NAME: 'mockhttpapi',
	MOCK_API_RESOURCE_GROUP: 'memfault-mock-api',
	MOCK_API_APP_NAME: 'MockHttpAPI',
	...process.env,
})

export type World = {
	'httpApiMock:apiEndpoint': string
	deviceId?: string
}
logProgress('Azure', 'Getting credentials...')

const { credentials, subscriptionId } = await cliCredentials()

const wsClient = new WebSiteManagementClient(credentials, subscriptionId)
logProgress('Azure', 'Fetching mock API settings')
const [mockAPIEndpoint, mockAPIApiSettings] = await Promise.all([
	wsClient.webApps
		.get(mockAPIResourceGroup, mockAPIAppName)
		.then(({ defaultHostName }) => defaultHostName),
	// FIXME: there seems to be no NPM package to manage Azure function apps
	run({
		command: 'az',
		args: [
			'functionapp',
			'config',
			'appsettings',
			'list',
			'-g',
			mockAPIResourceGroup,
			'-n',
			mockAPIAppName,
		],
	}).then((res) => JSON.parse(res) as { name: string; value: string }[]),
])

const mockAPIStorageAccessKey = mockAPIApiSettings.find(
	({ name }) => name === 'STORAGE_ACCESS_KEY',
)?.value as string

if (mockAPIEndpoint === undefined) {
	error(`Could not determine mock HTTP API endpoint!`)
	process.exit(1)
}
if (mockAPIStorageAccessKey === undefined) {
	error(`Could not determine mock HTTP API storage access key!`)
	process.exit(1)
}
const mockAPIEndpointUrl = `https://${mockAPIEndpoint}/`

logProgress('Azure', 'Fetching IoT Hub info')
const iotHubClient = new IotHubClient(credentials, subscriptionId)
const res = await iotHubClient.iotHubResource.get(resourceGroup, iotHubName)
const iotHubHostname = res.properties?.hostName as string
const {
	value: {
		keyName, //'iothubowner'
		primaryKey, //: 'ugLZMJFBRBr5gI7+adifhtEBieKPcHPCoHtLBb+zsFQ=',
	},
} = await iotHubClient.iotHubResource.listKeys(resourceGroup, iotHubName).next()

const registry = Registry.fromConnectionString(
	`HostName=${iotHubHostname};SharedAccessKeyName=${keyName};SharedAccessKey=${primaryKey}`,
)

settings({
	Subscription: subscriptionId,
	'Resource Group': resourceGroup,
	'Mock HTTP API endpoint': mockAPIEndpointUrl,
	'Mock HTTP API resource group': mockAPIResourceGroup,
	'IoT Hub Resource Group': resourceGroup,
	'IoT Hub Name': iotHubName,
	'IoT Hub Endpoint': iotHubHostname,
})

const world: World = {
	'httpApiMock:apiEndpoint': `${mockAPIEndpointUrl}api/`,
} as const
heading('World')
settings(world)

const runner = await runFolder<World>({
	name: 'Azure Memfault Integration',
	folder: path.join(process.cwd(), 'features'),
	logObserver: {
		onProgress: (_, ...progress) =>
			console.error(...progress.map((s) => chalk.grey(s))),
		onError: (_, error) => console.error(chalk.red(JSON.stringify(error))),
	},
})
const { steps: deviceSteps, cleanUp: deviceStepsCleanUp } = deviceStepRunners({
	iotHub: iotHubClient,
	iotHubHostname,
	iotHubName,
	resourceGroup,
	registry,
})

runner.addStepRunners(...deviceSteps).addStepRunners(
	...(() => {
		const tableClient = (tableName: string) =>
			new TableClient(
				`https://${mockAPIStorageAccountName}.table.core.windows.net`,
				tableName,
				new AzureNamedKeyCredential(
					mockAPIStorageAccountName,
					mockAPIStorageAccessKey,
				),
			)
		return httpApiMockStepRunners({
			requestsClient: tableClient('Requests'),
			responsesClient: tableClient('Responses'),
		})
	})(),
)

const testResult = await runner.run(world)

consoleReporter(testResult, console.log)

await writeFile(
	path.join(process.cwd(), 'e2e-test-result.json'),
	JSON.stringify(testResult),
	'utf-8',
)

await deviceStepsCleanUp()

if (!testResult.ok) {
	error('Running the features failed!')
	process.exit(1)
}
