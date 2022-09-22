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
import { Registry } from 'azure-iothub'
import * as chai from 'chai'
import { expect } from 'chai'
import chaiSubset from 'chai-subset'
import { readFile } from 'fs/promises'
import { MqttClient } from 'mqtt'
import path from 'path'
import { connectDevice } from '../../cli/iot/connectDevice.js'
import { deviceTopics } from '../../cli/iot/deviceTopics.js'
import { ulid } from '../../lib/ulid.js'
import { matchDeviceBoundTopic } from './device/matchDeviceBoundTopic.js'
import {
	selfSignedCertificate,
	verificationCert,
} from './device/selfSignedIotCertificate.js'
chai.use(chaiSubset)

/**
 * Ensures certificate names are not too long.
 */
const certificateName = (name: string): string =>
	name.slice(0, 64).replace(/-$/, '')

const certs: Record<
	string,
	{
		certificate: string
		key: string
		fingerprint: string
	}
> = {}

export const deviceStepRunners = ({
	iotHub,
	iotHubHostname,
	iotHubName,
	iotHubResourceGroup,
	registry,
}: {
	iotHub: IotHubClient
	iotHubHostname: string
	iotHubName: string
	iotHubResourceGroup: string
	registry: Registry
}): {
	steps: StepRunner<Record<string, unknown>>[]
	cleanUp: () => Promise<void>
} => {
	const connections = {} as Record<string, MqttClient>
	const certificates: CertificateDescription[] = []

	const store: Record<string, any> = {}

	return {
		steps: [
			async ({
				step,
				log: {
					step: { progress },
				},
			}) => {
				if (!/^I connect a device$/.test(step.title)) return noMatch

				// FIXME: see https://docs.microsoft.com/en-us/azure/iot-hub/tutorial-x509-self-sign for creating test certificates
				const deviceId = (await randomWords({ numWords: 3 })).join('-')

				certs[deviceId] =
					certs[deviceId] ??
					(await selfSignedCertificate({ commonName: deviceId }))

				progress(`Registering certificate for ${deviceId}`)
				const certRegistrationRes = await iotHub.certificates.createOrUpdate(
					iotHubResourceGroup,
					iotHubName,
					certificateName(deviceId),
					{
						properties: {
							certificate: certs[deviceId].certificate,
						},
						verified: true,
					} as any,
				)
				progress(JSON.stringify(certRegistrationRes))
				certificates.push(certRegistrationRes)

				const verificationCodeRes =
					await iotHub.certificates.generateVerificationCode(
						iotHubResourceGroup,
						iotHubName,
						certRegistrationRes.name as string,
						certRegistrationRes.etag as string,
					)

				const verificationCode =
					verificationCodeRes.properties?.verificationCode ?? ''
				progress(`Verification code: ${verificationCode}`)

				const verCert = await verificationCert({
					commonName: verificationCode,
					privateKey: certs[deviceId].key,
				})

				progress(`Verifying certificate for ${deviceId}`)
				const verifyRes = await iotHub.certificates.verify(
					iotHubResourceGroup,
					iotHubName,
					certRegistrationRes.name as string,
					verificationCodeRes.etag as string,
					{
						certificate: [
							certs[deviceId].certificate,
							verCert.certificate,
						].join('\n'),
					},
				)
				progress(JSON.stringify(verifyRes))

				progress(`Registering device for ${deviceId}`)
				const deviceCreationResult = await new Promise((resolve, reject) =>
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
				progress(JSON.stringify(deviceCreationResult))

				progress(
					`Connecting`,
					JSON.stringify(
						{
							deviceId,
							iotHub: iotHubHostname,
							key: certs[deviceId].key,
							certificate: certs[deviceId].certificate,
						},
						null,
						2,
					),
				)
				const connection = await connectDevice({
					deviceId,
					iotHub: iotHubHostname,
					key: certs[deviceId].key,
					certificate: certs[deviceId].certificate,
					ca: (
						await readFile(
							path.join(process.cwd(), 'data', 'BaltimoreCyberTrustRoot.pem'),
						)
					).toString(),
				})

				connections[deviceId] = connection

				return {
					matched: true,
					result: deviceId,
				}
			},
			async ({ step }): Promise<StepRunResult> => {
				const match = matchGroups(
					Type.Object({
						deviceId: Type.String({ minLength: 1 }),
					}),
				)(
					/^the (?:device|tracker) "(?<deviceId>[^"]+)" updates its reported state with$/,
					step.title,
				)
				if (match === null) return noMatch

				const reported = JSON.parse(codeBlockOrThrow(step).code)
				const connection = connections[match.deviceId]
				connection.publish(
					deviceTopics.updateTwinReported(ulid()),
					JSON.stringify(reported),
				)
			},
			async ({ step }): Promise<StepRunResult> => {
				const match = matchGroups(
					Type.Object({
						deviceId: Type.String({ minLength: 1 }),
						topic: Type.String({ minLength: 1 }),
					}),
				)(
					/^the (?:device|tracker) "(?<deviceId>[^"]+)" publishes this message to the topic (?<topic>.+)$/,
					step.title,
				)
				if (match === null) return noMatch
				const message = JSON.parse(codeBlockOrThrow(step).code)
				const connection = connections[match.deviceId]
				connection.publish(match.topic, JSON.stringify(message))
			},
			async ({
				step,
				log: {
					scenario: { progress },
				},
			}) => {
				const match = matchGroups(
					Type.Object({
						deviceId: Type.String({ minLength: 1 }),
						topic: Type.String({ minLength: 1 }),

						messageCount: Type.Integer({ minimum: 1 }),
						raw: Type.Optional(Type.String({ minLength: 1 })),
						storeName: Type.Optional(Type.String({ minLength: 1 })),
					}),
					{ messageCount: (s) => parseInt(s, 10) },
				)(
					/^the (?:device|tracker) "(?<deviceId>[^"]+)" receives (?<messageCount>a|[1-9][0-9]*) (?<raw>raw )?messages? on the topic (?<topic>[^ ]+)(?: into "(?<storeName>[^"]+)")?$/,
					step.title,
				)
				if (match === null) return noMatch

				const {
					topic,
					deviceId,
					raw,
					messageCount: expectedMessageCount,
					storeName,
				} = match

				if (!topic.startsWith(`devices/${deviceId}/messages/devicebound`))
					throw new Error(
						`Must subscribe to the device topic devices/${deviceId}/messages/devicebound`,
					)
				const connection = connections[deviceId]
				const isRaw = raw !== undefined

				const messages: (Record<string, any> | string)[] = []

				return new Promise((resolve, reject) => {
					const timeout = setTimeout(() => {
						reject(
							new Error(
								`timed out with ${
									expectedMessageCount - messages.length
								} message${
									expectedMessageCount > 1 ? 's' : ''
								} yet to receive.`,
							),
						)
					}, 60 * 1000)

					// @see https://docs.microsoft.com/en-us/azure/iot-hub/iot-hub-mqtt-support#receiving-cloud-to-device-messages
					connection.subscribe(`devices/${deviceId}/messages/devicebound/#`)

					const done = (result: any) => {
						connection.unsubscribe(`devices/${deviceId}/messages/devicebound/#`)
						resolve(result)
					}

					connection.on('message', async (t: string, message: Buffer) => {
						if (!matchDeviceBoundTopic(topic, t)) return
						progress(JSON.stringify(message))
						const m = isRaw
							? message.toString('hex')
							: JSON.parse(message.toString('utf-8'))
						messages.push(m)
						if (messages.length === expectedMessageCount) {
							clearTimeout(timeout)

							const result = messages.length > 1 ? messages : messages[0]

							if (storeName !== undefined) store[storeName] = result

							if (isRaw) {
								if (messages.length > 1)
									return done(
										messages.map(
											(m) =>
												`(${
													Buffer.from(m as string, 'hex').length
												} bytes of data)`,
										),
									)
								return done(
									`(${
										Buffer.from(messages[0] as string, 'hex').length
									} bytes of data)`,
								)
							}

							return done(result)
						}
					})
				})
			},
			async ({ step }) => {
				enum ShadowType {
					desired = 'desired',
					reported = 'reported',
				}
				const match = matchGroups(
					Type.Object({
						desiredOrReported: Type.Enum(ShadowType),
						deviceId: Type.String({ minLength: 1 }),
						equalOrMatch: Type.Optional(Type.String({ minLength: 1 })),
					}),
				)(
					/^the (?<desiredOrReported>desired|reported) state of the (?:device|tracker) "(?<deviceId>[^"]+)" (?:should )?(?<equalOrMatch>equals?|match(?:es)?)$/,
					step.title,
				)

				if (match === null) return noMatch

				const j = JSON.parse(codeBlockOrThrow(step).code)
				const connection = connections[match.deviceId]
				const state: Record<string, any> = await new Promise(
					(resolve, reject) => {
						const getTwinPropertiesRequestId = ulid()
						const i = setTimeout(reject, 20000)
						connection.publish(
							deviceTopics.getTwinProperties(getTwinPropertiesRequestId),
							'',
						)
						connection.subscribe(
							deviceTopics.getTwinPropertiesAccepted(
								getTwinPropertiesRequestId,
							),
						)
						connection.once('message', (topic, payload) => {
							if (
								topic !==
								deviceTopics.getTwinPropertiesAccepted(
									getTwinPropertiesRequestId,
								)
							) {
								console.debug('[iot]', `Unexpected topic: ${topic}`)
								reject(new Error(`Unexpected topic: ${topic}`))
								clearInterval(i)
							}
							resolve(JSON.parse(payload.toString()))
							clearInterval(i)
						})
					},
				)
				const fragment = state[match.desiredOrReported]
				if ((match.equalOrMatch ?? '').startsWith('match')) {
					expect(fragment).to.containSubset(j)
				} else {
					expect(fragment).to.deep.equal(j)
				}
				return state
			},
		],
		cleanUp: async () => {
			await Promise.all(
				certificates.map(async (cert) =>
					iotHub.certificates.delete(
						iotHubResourceGroup,
						iotHubName,
						cert.name as string,
						cert.etag as string,
					),
				),
			)
		},
	}
}
