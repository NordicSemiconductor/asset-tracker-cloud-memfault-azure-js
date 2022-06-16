import { WebSiteManagementClient } from '@azure/arm-appservice'
import { AzureNamedKeyCredential } from '@azure/core-auth'
import { TableClient } from '@azure/data-tables'
import {
	ConsoleReporter,
	FeatureRunner,
	randomStepRunners,
	restStepRunners,
	storageStepRunners,
} from '@nordicsemiconductor/e2e-bdd-test-runner'
import chalk from 'chalk'
import { program } from 'commander'
import * as path from 'path'
import { v4 } from 'uuid'
import { cliCredentials } from '../cli/cliCredentials.js'
import {
	CAIntermediateFileLocations,
	CARootFileLocations,
} from '../cli/iot/caFileLocations.js'
import { fingerprint } from '../cli/iot/fingerprint.js'
import { list } from '../cli/iot/intermediateRegistry.js'
import { ioTHubDPSInfo } from '../cli/iot/ioTHubDPSInfo.js'
import { debug, error, heading, settings } from '../cli/logging.js'
import { run } from '../cli/process/run.js'
import { fromEnv } from '../lib/fromEnv.js'
import { gpsDay } from '../pgps/gpsTime.js'
import { randomEmail } from './lib/randomEmail.js'
import { randomPassword } from './lib/randomPassword.js'
import { b2cSteps } from './steps/b2c.js'
import { deviceStepRunners } from './steps/device.js'
import { httpApiMockStepRunners } from './steps/httpApiMock.js'

let ran = false

export type World = {
	apiEndpoint: string
	'httpApiMock:apiEndpoint': string
	currentGpsDay: number
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

			const {
				b2cTenant,
				clientId,
				clientSecret,
				b2cTenantId,
				resourceGroup,
				appName,
				mockHTTPStorageAccountName,
			} = fromEnv({
				b2cTenant: 'B2C_TENANT',
				clientId: 'APP_REG_CLIENT_ID',
				clientSecret: 'B2C_CLIENT_SECRET',
				b2cTenantId: 'B2C_TENANT_ID',
				resourceGroup: 'RESOURCE_GROUP',
				appName: 'APP_NAME',
				mockHTTPStorageAccountName: 'MOCK_HTTP_API_STORAGE_ACCOUNT_NAME',
			})(process.env)

			const { credentials, subscriptionId } = await cliCredentials()

			const wsClient = new WebSiteManagementClient(credentials, subscriptionId)
			const [apiEndpoint, mockHTTPApiEndpoint, mockHTTPApiSettings] =
				await Promise.all([
					wsClient.webApps
						.get(resourceGroup, `${appName}api`)
						.then(({ defaultHostName }) => defaultHostName),
					wsClient.webApps
						.get(resourceGroup, `${mockHTTPStorageAccountName}Functions`)
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
							resourceGroup,
							'-n',
							`${mockHTTPStorageAccountName}Functions`,
						],
					}).then(
						(res) => JSON.parse(res) as { name: string; value: string }[],
					),
				])

			const mockHTTPStorageAccessKey = mockHTTPApiSettings.find(
				({ name }) => name === 'STORAGE_ACCESS_KEY',
			)?.value as string

			if (apiEndpoint === undefined) {
				error(`Could not determine API endpoint!`)
				process.exit(1)
			}
			if (mockHTTPApiEndpoint === undefined) {
				error(`Could not determine mock HTTP API endpoint!`)
				process.exit(1)
			}
			if (mockHTTPStorageAccessKey === undefined) {
				error(`Could not determine mock HTTP API storage access key!`)
				process.exit(1)
			}
			const apiEndpointUrl = `https://${apiEndpoint}/`
			const mockHTTPApiEndpointUrl = `https://${mockHTTPApiEndpoint}/`

			const certsDir = await ioTHubDPSInfo({
				resourceGroupName: resourceGroup,
				credentials: {
					credentials,
					subscriptionId,
				},
			})().then(({ hostname }) =>
				path.join(process.cwd(), 'certificates', hostname),
			)

			const intermediateCerts = await list({ certsDir })
			const intermediateCertId = intermediateCerts[0]
			if (intermediateCertId === undefined) {
				error(`Intermediate certificate not found!`)
				process.exit(1)
			}
			const intermediateCaFiles = CAIntermediateFileLocations({
				certsDir,
				id: intermediateCertId,
			})
			const rootCaFiles = CARootFileLocations(certsDir)

			settings({
				Subscription: subscriptionId,
				'Resource Group': resourceGroup,
				'Application Name': appName,
				'API endpoint': apiEndpointUrl,
				'AD B2C Tenant': b2cTenant,
				'AD B2C Tenant ID': b2cTenantId,
				'AD B2C Client ID': clientId,
				'AD B2C Client Secret': `${clientSecret.slice(
					0,
					5,
				)}***${clientSecret.slice(-5)}`,
				'Certificate dir': certsDir,
				'Root CA fingerprint': await fingerprint(rootCaFiles.cert),
				'Intermediate CA ID': intermediateCertId,
				'Intermediate CA fingerprint': await fingerprint(
					intermediateCaFiles.cert,
				),
				'Mock HTTP API endpoint': mockHTTPApiEndpointUrl,
			})

			const world: World = {
				apiEndpoint: `${apiEndpointUrl}api/`,
				'httpApiMock:apiEndpoint': `${mockHTTPApiEndpointUrl}api/`,
				currentGpsDay: gpsDay(),
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
							email: randomEmail,
							password: randomPassword,
							UUID: v4,
						},
					}),
				)
				.addStepRunners(
					await b2cSteps({
						b2cTenant,
						clientId,
						clientSecret,
						b2cTenantId,
					}),
				)
				.addStepRunners(restStepRunners())
				.addStepRunners(deviceStepRunners({ certsDir, intermediateCertId }))
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
