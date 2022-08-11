import { connect, MqttClient } from 'mqtt'

/**
 * Connect the device to the Azure IoT Hub.
 */
export const connectDevice = async ({
	deviceId,
	iotHub,
	log,
	certificate,
	key,
}: {
	deviceId: string
	iotHub: string
	certificate: string
	key: string
	log?: (...args: any[]) => void
}): Promise<MqttClient> =>
	new Promise((resolve, reject) => {
		log?.(`Connecting to`, `${iotHub}`)
		const client = connect({
			host: iotHub,
			port: 8883,
			key,
			cert: certificate,
			rejectUnauthorized: true,
			clientId: deviceId,
			protocol: 'mqtts',
			username: `${iotHub}/${deviceId}/?api-version=2020-09-30`,
			protocolVersion: 4,
			clean: true,
		})
		client.on('connect', async () => {
			log?.('Connected', deviceId)
			resolve(client)
		})
		client.on('error', (err) => {
			console.error(`Error while connecting device: ${err}`)
			reject(err)
		})
	})
