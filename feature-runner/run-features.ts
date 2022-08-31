import { WebSiteManagementClient } from '@azure/arm-appservice'
import { IotHubClient } from '@azure/arm-iothub'
import { AzureNamedKeyCredential } from '@azure/core-auth'
import { TableClient } from '@azure/data-tables'
import {
	ConsoleReporter,
	FeatureRunner,
	randomStepRunners,
	restStepRunners,
	storageStepRunners,
} from '@nordicsemiconductor/e2e-bdd-test-runner'
import { fromEnv } from '@nordicsemiconductor/from-env'
import iothub from 'azure-iothub'
import chalk from 'chalk'
import program from 'commander'
import { cliCredentials } from '../cli/cliCredentials.js'
import { progress as logProgress } from '../cli/logging'
import { debug, error, heading, settings } from '../cli/logging.js'
import { run } from '../cli/process/run.js'
import { ulid } from '../lib/ulid.js'
import { deviceStepRunners } from './steps/device.js'
import { httpApiMockStepRunners } from './steps/httpApiMock.js'
const { Registry } = iothub

const {
	resourceGroup,
	iotHubResourceGroup,
	iotHubName,
	mockHTTPStorageAccountName,
	mockHTTPResourceGroup,
} = fromEnv({
	resourceGroup: 'RESOURCE_GROUP',
	iotHubResourceGroup: 'IOT_HUB_RESOURCE_GROUP',
	iotHubName: 'IOT_HUB_NAME',
	mockHTTPStorageAccountName: 'MOCK_HTTP_API_STORAGE_ACCOUNT_NAME',
	mockHTTPResourceGroup: 'MOCK_API_RESOURCE_GROUP',
})({
	MOCK_HTTP_API_STORAGE_ACCOUNT_NAME: 'mockhttpapi',
	MOCK_API_RESOURCE_GROUP: 'memfault-mock-api',
	...process.env,
})

let ran = false

export type World = {
	'httpApiMock:apiEndpoint': string
}

program
	.arguments('<featureDir>')
	.option('-r, --print-results', 'Print results')
	.option('-p, --progress', 'Print progress')
	.option('-X, --no-retry', 'Do not retry steps')
	.action(
		async (
			featureDir: string,
			{
				printResults,
				progress,
				retry,
			}: {
				printResults: boolean
				subscription: string
				progress: boolean
				retry: boolean
			},
		) => {
			ran = true

			logProgress('Azure', 'Getting credentials...')
			const { credentials, subscriptionId } = await cliCredentials()

			const wsClient = new WebSiteManagementClient(credentials, subscriptionId)
			logProgress('Azure', 'Fetching mock API settings')
			const [mockHTTPApiEndpoint, mockHTTPApiSettings] = await Promise.all([
				wsClient.webApps
					.get(mockHTTPResourceGroup, `MockHttpAPI`)
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
						mockHTTPResourceGroup,
						'-n',
						`MockHttpAPI`,
					],
				}).then((res) => JSON.parse(res) as { name: string; value: string }[]),
			])

			const mockHTTPStorageAccessKey = mockHTTPApiSettings.find(
				({ name }) => name === 'STORAGE_ACCESS_KEY',
			)?.value as string

			if (mockHTTPApiEndpoint === undefined) {
				error(`Could not determine mock HTTP API endpoint!`)
				process.exit(1)
			}
			if (mockHTTPStorageAccessKey === undefined) {
				error(`Could not determine mock HTTP API storage access key!`)
				process.exit(1)
			}
			const mockHTTPApiEndpointUrl = `https://${mockHTTPApiEndpoint}/`

			logProgress('Azure', 'Fetching IoT Hub info')
			const iotHubClient = new IotHubClient(credentials, subscriptionId)
			const res = await iotHubClient.iotHubResource.get(
				iotHubResourceGroup,
				iotHubName,
			)
			const iotHubHostname = res.properties?.hostName as string
			const {
				value: {
					keyName, //'iothubowner'
					primaryKey, //: 'ugLZMJFBRBr5gI7+adifhtEBieKPcHPCoHtLBb+zsFQ=',
				},
			} = await iotHubClient.iotHubResource
				.listKeys(iotHubResourceGroup, iotHubName)
				.next()

			const registry = Registry.fromConnectionString(
				`HostName=${iotHubHostname};SharedAccessKeyName=${keyName};SharedAccessKey=${primaryKey}`,
			)

			settings({
				Subscription: subscriptionId,
				'Resource Group': resourceGroup,
				'Mock HTTP API endpoint': mockHTTPApiEndpointUrl,
				'IoT Hub Resource Group': iotHubResourceGroup,
				'IoT Hub Name': iotHubName,
				'IoT Hub Endpoint': iotHubHostname,
			})

			const world: World = {
				'httpApiMock:apiEndpoint': `${mockHTTPApiEndpointUrl}api/`,
			} as const
			heading('World')
			settings(world)
			if (!retry) {
				debug('Test Runner:', chalk.red('❌'), chalk.red('Retries disabled.'))
			}

			const runner = new FeatureRunner<World>(world, {
				dir: featureDir,
				reporters: [
					new ConsoleReporter({
						printResults,
						printProgress: progress,
						printProgressTimestamps: true,
						printSummary: true,
					}),
				],
				retry,
			})
			runner
				.addStepRunners(
					randomStepRunners({
						generators: {
							ULID: ulid,
						},
					}),
				)
				.addStepRunners(restStepRunners())
				.addStepRunners(
					deviceStepRunners({
						iotHub: iotHubClient,
						iotHubHostname,
						iotHubName,
						iotHubResourceGroup,
						registry,
					}),
				)
				.addStepRunners(storageStepRunners())
				.addStepRunners(
					(() => {
						const tableClient = (tableName: string) =>
							new TableClient(
								`https://${mockHTTPStorageAccountName}.table.core.windows.net`,
								tableName,
								new AzureNamedKeyCredential(
									mockHTTPStorageAccountName,
									mockHTTPStorageAccessKey,
								),
							)
						return httpApiMockStepRunners({
							requestsClient: tableClient('Requests'),
							responsesClient: tableClient('Responses'),
						})
					})(),
				)

			try {
				const { success } = await runner.run()
				if (!success) {
					process.exit(1)
				}
				process.exit()
			} catch (e) {
				error('Running the features failed!')
				error((e as Error).message)
				process.exit(1)
			}
		},
	)
	.parse(process.argv)

if (!ran) {
	program.outputHelp()
	process.exit(1)
}
