import { IotHubClient } from '@azure/arm-iothub'
import {
	InterpolatedStep,
	regexGroupMatcher,
	regexMatcher,
	StepRunnerFunc,
} from '@nordicsemiconductor/e2e-bdd-test-runner'
import { randomWords } from '@nordicsemiconductor/random-words'
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
import { selfSignedCertificate } from './device/selfSignedIotCertificate.js'
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
}): ((step: InterpolatedStep) => StepRunnerFunc<any> | false)[] => {
	const connections = {} as Record<string, MqttClient>

	return [
		regexMatcher(/^I connect a device$/)(async (_, __, runner) => {
			// FIXME: see https://docs.microsoft.com/en-us/azure/iot-hub/tutorial-x509-self-sign for creating test certificates
			const deviceId = (await randomWords({ numWords: 3 })).join('-')

			certs[deviceId] =
				certs[deviceId] ?? (await selfSignedCertificate({ deviceId }))

			await runner.progress(`IoT`, `Registering certificate for ${deviceId}`)
			const certRegistrationRes = await iotHub.certificates.createOrUpdate(
				iotHubResourceGroup,
				iotHubName,
				certificateName(deviceId),
				{
					properties: {
						certificate: certs[deviceId].certificate,
					},
				},
			)
			await runner.progress(`IoT`, JSON.stringify(certRegistrationRes))

			/*

			{"properties":{"subject":"unformed-mayaarch-straiten","expiry":"2022-09-02T15:18:47.000Z","thumbprint":"DDA88CEC58806CAF47A69EC0761AF22295AFAC48","isVerified":false,"created":"2001-01-01T00:00:00.000Z","updated":"2022-08-31T15:18:24.000Z","certificate":"-----BEGIN CERTIFICATE-----\nMIIC0TCCAbkCFEDXsuz+hlNADxZolQXAaySAAHsmMA0GCSqGSIb3DQEBCwUAMCUx\nIzAhBgNVBAMMGnVuZm9ybWVkLW1heWFhcmNoLXN0cmFpdGVuMB4XDTIyMDgzMTE1\nMTg0N1oXDTIyMDkwMjE1MTg0N1owJTEjMCEGA1UEAwwadW5mb3JtZWQtbWF5YWFy\nY2gtc3RyYWl0ZW4wggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQCR8+O6\n7eLuTHatAQNzOrJiCjqeiiH/99YcRi/+ojPn74SGm+1cqcirC+CefykCVzylTguD\n1gDd2y0fwNd8U+1nhaTzoLy4q4vHHUhj7WPT50CmOZ55aaLykuUAGLniASCr/A5j\notV0AAADo+P8D2KNhFNXzBivTAlmoswNKylQmltnPbamO5gGH17bo7BRXmz3Ypd4\nP7SQVreVNZw1UMBAEzBQ8HdFirnvq+ZKgGnz5DJ0BgIrGJYCFSl8Rp+nFyNhZZEm\nrtKko50LRSx4/Gp3QluufLGNU34aWGzdbDIvlw549FkScO1jV/iJWUQc0kmSnbuV\nINqj2CjGg68XXJ/PAgMBAAEwDQYJKoZIhvcNAQELBQADggEBAEUjSLoszHFz6CSz\nHD/B7iuFibBppC5IWW9L873fTC/NKoRwxvL71bF8yk5cYfy3pNIw1qQaqUrUndL0\nRSEz9t0YqbL6H/LA+lzuT+xiHNbhtc0OZaRT2IO6ozbhSePRr1oqKEJnhpajZpQN\nf0wHv1lM+YRyVLE7b/RqxXKDoD3vNT05lb16cMTdXC/IMF1m3UT8DEXQWVHswjsM\nkreMRpPK7o69f1DkI0H43LYaZHWkb7h7ywjM0SmuLB0M49CXfE2LfCAiSdXJwVju\n0R7UtNOYWGGBC2gc31LYKJArREAiD0Lg1vuvFlqQfl+wthxov51ybh4oQFTqQ/HZ\n/h4tNao=\n-----END CERTIFICATE-----"},"id":"/subscriptions/e2c1b49f-461f-4945-9f7a-798c15ba0901/resourceGroups/assettrackerprod/providers/Microsoft.Devices/IotHubs/assettrackerprodIotHub/certificates/unformed-mayaarch-straiten","name":"unformed-mayaarch-straiten","etag":"ImViMDA4ZjU4LTAwMDAtMGMwMC0wMDAwLTYzMGY3YmMwMDAwMCI=","type":"Microsoft.Devices/IotHubs/Certificates"}
			*/

			// FIXME: verify
			await iotHub.certificates.verify(iotHubResourceGroup, iotHubName)

			// TODO: Delete cert after test, because there is a limit of 25 per iothub

			await runner.progress(`IoT`, `Registering device for ${deviceId}`)
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
			await runner.progress(`IoT`, JSON.stringify(deviceCreationResult))

			await runner.progress(
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
