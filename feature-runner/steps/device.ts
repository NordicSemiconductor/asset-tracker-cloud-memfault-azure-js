import { CertificateDescription, IotHubClient } from '@azure/arm-iothub'
import {
	codeBlockOrThrow,
	matchGroups,
	noMatch,
	StepRunner,
	StepRunResult,
} from '@nordicsemiconductor/bdd-markdown'
import { randomWords } from '@nordicsemiconductor/random-words'
import { Type } from '@sinclair/typebox'
import { Message } from 'azure-iot-common/dist/message'
import { Client } from 'azure-iot-device'
import { clientFromConnectionString } from 'azure-iot-device-mqtt'
import { Registry } from 'azure-iothub'
import * as chai from 'chai'
import chaiSubset from 'chai-subset'
import { World } from '../run-features.js'
chai.use(chaiSubset)

enum TwinState {
	desired = 'desired',
	reported = 'reported',
}

const updateTwin = async (
	registry: Registry,
	deviceId: string,
	update: Record<string, any>,
) => {
	const res = await registry.getTwin(deviceId)
	const {
		responseBody: { tags, properties, etag },
	} = res

	await registry.updateTwin(
		deviceId,
		{
			tags,
			properties,
			...update,
		},
		etag,
	)
}

export const deviceStepRunners = ({
	iotHub,
	iotHubHostname,
	iotHubName,
	resourceGroup,
	registry,
}: {
	iotHub: IotHubClient
	iotHubHostname: string
	iotHubName: string
	resourceGroup: string
	registry: Registry
}): {
	steps: StepRunner<World>[]
	cleanUp: () => Promise<void>
} => {
	const connections = {} as Record<string, Client>
	const certificates: CertificateDescription[] = []

	return {
		steps: [
			async ({
				step,
				log: {
					step: { progress },
				},
				context,
			}) => {
				if (!/^I connect a device$/.test(step.title)) return noMatch

				const deviceId = (await randomWords({ numWords: 3 })).join('-')

				progress(`Registering device for ${deviceId}`)
				await new Promise((resolve, reject) =>
					registry.create(
						{
							deviceId,
						},
						(error, result) => {
							if (error !== undefined && error !== null) return reject(error)
							resolve(result)
						},
					),
				)

				const key = (await registry.get(deviceId)).responseBody.authentication
					?.symmetricKey?.primaryKey
				const connectionString = `HostName=${iotHubHostname};DeviceId=${deviceId};SharedAccessKey=${key}`

				progress(`Connecting`, deviceId)
				connections[deviceId] = clientFromConnectionString(connectionString)

				context.deviceId = deviceId

				return {
					matched: true,
					result: deviceId,
				}
			},
			async ({
				step,
				log: {
					step: { error },
				},
				context,
			}): Promise<StepRunResult> => {
				const match = matchGroups(
					Type.Object({
						properties: Type.Optional(Type.String({ minLength: 1 })),
					}),
				)(
					/^the device publishes this event(?: with the properties `(?<properties>[^`]+)`)$/,
					step.title,
				)
				if (match === null) return noMatch
				const { properties } = match
				const message = codeBlockOrThrow(step).code
				const connection = connections[context.deviceId ?? '']
				const m = new Message(message)
				if (properties !== undefined) {
					const props = new URLSearchParams(properties)
					props.forEach((value, name) => m.properties.add(name, value))
				}
				connection.sendEvent(m).catch(error)
			},
			async ({ step, context }): Promise<StepRunResult> => {
				const match = matchGroups(
					Type.Object({
						name: Type.String({ minLength: 1 }),
						value: Type.String({ minLength: 1 }),
					}),
				)(
					/^I set the device tag `(?<name>[^`]+)` to `(?<value>[^`]+)`$/,
					step.title,
				)
				if (match === null) return noMatch
				const { name, value } = match
				await updateTwin(registry, context.deviceId as string, {
					tags: { [name]: value },
				})
			},
			async ({ step, context }): Promise<StepRunResult> => {
				const match = matchGroups(
					Type.Object({
						twinState: Type.Enum(TwinState),
					}),
				)(
					/^the device updates its (?<twinState>reported|desired) state to$/,
					step.title,
				)
				if (match === null) return noMatch

				const state = JSON.parse(codeBlockOrThrow(step).code)
				const { twinState } = match
				await updateTwin(registry, context.deviceId as string, {
					properties: { [twinState]: state },
				})
			},
		],
		cleanUp: async () => {
			await Promise.all(
				certificates.map(async (cert) =>
					iotHub.certificates.delete(
						resourceGroup,
						iotHubName,
						cert.name as string,
						cert.etag as string,
					),
				),
			)
		},
	}
}
