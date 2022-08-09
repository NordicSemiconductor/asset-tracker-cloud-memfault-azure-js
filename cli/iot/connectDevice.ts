import { promises as fs } from 'fs'
import { connect, MqttClient } from 'mqtt'
import { run } from '../process/run.js'
import { deviceFileLocations } from './deviceFileLocations.js'

/**
 * Connect the device to the Azure IoT Hub.
 * If this device is not yet registered, connect to the Device Provisioning Service (DPS) to acquire the assigned IoT Hub hostname.
 */
export const connectDevice = async ({
	deviceId,
	certsDir,
	log,
}: {
	deviceId: string
	log?: (...args: any[]) => void
	certsDir: string
}): Promise<MqttClient> => {
	const deviceFiles = deviceFileLocations({
		certsDir,
		deviceId,
	})
	const [deviceCert, deviceKey] = await Promise.all([
		fs.readFile(deviceFiles.certWithChain, 'utf-8'),
		fs.readFile(deviceFiles.privateKey, 'utf-8'),
	])

	let iotHub: string

	try {
		log?.(`Loading config from`, deviceFiles.registration)
		iotHub = JSON.parse(
			await fs.readFile(deviceFiles.registration, 'utf-8'),
		).assignedHub
	} catch {
		// We run the provisioning in a separate process because MQTT.js does not play well with different connections in the same Node.js process.
		// What happens is that later instances of the client will not handle TLS ECONNRESET errors, so the execution stops.
		// Running the provisioning in its own process works around this problem.
		iotHub = await run({
			command: 'node',
			args: ['cli', 'provision-simulator-device', deviceId],
			log,
			env: {
				DONT_DIE_ON_UNHANDLED_EXCEPTIONS: '1',
				...process.env,
			},
		})
	}

	return new Promise((resolve, reject) => {
		log?.(`Connecting to`, `${iotHub}`)
		const client = connect({
			host: iotHub,
			port: 8883,
			key: deviceKey,
			cert: deviceCert,
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
}
