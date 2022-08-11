import { IotHubClient } from '@azure/arm-iothub'
import {
	InterpolatedStep,
	regexGroupMatcher,
	regexMatcher,
	StepRunnerFunc,
} from '@nordicsemiconductor/e2e-bdd-test-runner'
import { randomWords } from '@nordicsemiconductor/random-words'
import * as chai from 'chai'
import { expect } from 'chai'
import chaiSubset from 'chai-subset'
import { MqttClient } from 'mqtt'
import { CertificateCreationResult, createCertificate } from 'pem'
import { connectDevice } from '../../cli/iot/connectDevice.js'
import { deviceTopics } from '../../cli/iot/deviceTopics.js'
import { leafCertConfig } from '../../cli/iot/pemConfig.js'
import { ulid } from '../../lib/ulid.js'
import { matchDeviceBoundTopic } from './device/matchDeviceBoundTopic.js'
chai.use(chaiSubset)

/**
 * Ensures certificate names are not too long.
 */
const certificateName = (name: string): string =>
	name.slice(0, 64).replace(/-$/, '')

const certs: Record<string, CertificateCreationResult> = {}

export const deviceStepRunners = ({
	iotHub,
	iotHubHostname,
	iotHubName,
	iotHubResourceGroup,
}: {
	iotHub: IotHubClient
	iotHubHostname: string
	iotHubName: string
	iotHubResourceGroup: string
}): ((step: InterpolatedStep) => StepRunnerFunc<any> | false)[] => {
	const connections = {} as Record<string, MqttClient>

	return [
		regexMatcher(/^I connect a device$/)(async (_, __, runner) => {
			// FIXME: see https://docs.microsoft.com/en-us/azure/iot-hub/tutorial-x509-self-sign for creating test certificates
			const deviceId = (await randomWords({ numWords: 3 })).join('-')
			certs[deviceId] =
				certs[deviceId] ??
				(await new Promise<CertificateCreationResult>((resolve, reject) =>
					createCertificate(
						{
							commonName: deviceId,
							serial: Math.floor(Math.random() * 1000000000),
							days: 1,
							config: leafCertConfig(deviceId),
						},
						(err, cert) => {
							if (err !== null && err !== undefined) return reject(err)
							resolve(cert)
						},
					),
				))

			await runner.progress(`IoT`, `Registering certificate for ${deviceId}`)
			const res = await iotHub.certificates.createOrUpdate(
				iotHubResourceGroup,
				iotHubName,
				certificateName(deviceId),
				{
					properties: {
						certificate: certs[deviceId].certificate,
					},
				},
			)
			await runner.progress(`IoT`, JSON.stringify(res))
			await runner.progress(
				`Connecting`,
				JSON.stringify(
					{
						deviceId,
						iotHub: iotHubHostname,
						key: certs[deviceId].clientKey,
						certificate: certs[deviceId].certificate,
					},
					null,
					2,
				),
			)
			const connection = await connectDevice({
				deviceId,
				iotHub: iotHubHostname,
				key: certs[deviceId].clientKey,
				certificate: certs[deviceId].certificate,
			})

			connections[deviceId] = connection
			return deviceId
		}),
		regexGroupMatcher(
			/^the (?:device|tracker) "(?<deviceId>[^"]+)" updates its reported state with$/,
		)(async ({ deviceId }, step) => {
			if (step.interpolatedArgument === undefined) {
				throw new Error('Must provide argument!')
			}
			const reported = JSON.parse(step.interpolatedArgument)
			const connection = connections[deviceId]
			connection.publish(
				deviceTopics.updateTwinReported(ulid()),
				JSON.stringify(reported),
			)
		}),
		regexGroupMatcher(
			/^the (?:device|tracker) "(?<deviceId>[^"]+)" publishes this message to the topic (?<topic>.+)$/,
		)(async ({ deviceId, topic }, step) => {
			if (step.interpolatedArgument === undefined) {
				throw new Error('Must provide argument!')
			}
			const message = JSON.parse(step.interpolatedArgument)
			const connection = connections[deviceId]
			connection.publish(topic, JSON.stringify(message))
		}),
		regexGroupMatcher(
			/^the (?:device|tracker) "(?<deviceId>[^"]+)" receives (?<messageCount>a|[1-9][0-9]*) (?<raw>raw )?messages? on the topic (?<topic>[^ ]+)(?: into "(?<storeName>[^"]+)")?$/,
		)(async ({ deviceId, messageCount, raw, topic, storeName }, _, runner) => {
			if (!topic.startsWith(`devices/${deviceId}/messages/devicebound`))
				throw new Error(
					`Must subscribe to the device topic devices/${deviceId}/messages/devicebound`,
				)
			const connection = connections[deviceId]
			const isRaw = raw !== undefined

			const expectedMessageCount =
				messageCount === 'a' ? 1 : parseInt(messageCount, 10)
			const messages: (Record<string, any> | string)[] = []

			return new Promise((resolve, reject) => {
				const timeout = setTimeout(() => {
					reject(
						new Error(
							`timed out with ${
								expectedMessageCount - messages.length
							} message${expectedMessageCount > 1 ? 's' : ''} yet to receive.`,
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
					await runner.progress(`Iot`, JSON.stringify(message))
					const m = isRaw
						? message.toString('hex')
						: JSON.parse(message.toString('utf-8'))
					messages.push(m)
					if (messages.length === expectedMessageCount) {
						clearTimeout(timeout)

						const result = messages.length > 1 ? messages : messages[0]

						if (storeName !== undefined) runner.store[storeName] = result

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
		}),
		regexGroupMatcher(
			/^the (?<desiredOrReported>desired|reported) state of the (?:device|tracker) "(?<deviceId>[^"]+)" (?:should )?(?<equalOrMatch>equals?|match(?:es)?)$/,
		)(async ({ desiredOrReported, deviceId, equalOrMatch }, step) => {
			if (step.interpolatedArgument === undefined) {
				throw new Error('Must provide argument!')
			}
			const j = JSON.parse(step.interpolatedArgument)
			const connection = connections[deviceId]
			const state: Record<string, any> = await new Promise(
				(resolve, reject) => {
					const getTwinPropertiesRequestId = ulid()
					const i = setTimeout(reject, 20000)
					connection.publish(
						deviceTopics.getTwinProperties(getTwinPropertiesRequestId),
						'',
					)
					connection.subscribe(
						deviceTopics.getTwinPropertiesAccepted(getTwinPropertiesRequestId),
					)
					connection.once('message', (topic, payload) => {
						if (
							topic !==
							deviceTopics.getTwinPropertiesAccepted(getTwinPropertiesRequestId)
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
			const fragment = state[desiredOrReported]
			if (equalOrMatch.startsWith('match')) {
				expect(fragment).to.containSubset(j)
			} else {
				expect(fragment).to.deep.equal(j)
			}
			return state
		}),
	]
}
