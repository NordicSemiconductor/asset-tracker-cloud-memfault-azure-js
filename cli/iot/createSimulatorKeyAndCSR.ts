import { promises as fs } from 'fs'
import { createCSR } from 'pem'
import { run } from '../process/run.js'
import { deviceFileLocations } from './deviceFileLocations.js'

export const defaultDeviceCertificateValidityInDays = 10950

/**
 * Creates a private key and a CSR for a simulated device
 */
export const createSimulatorKeyAndCSR = async ({
	certsDir,
	log,
	debug,
	deviceId,
}: {
	certsDir: string
	deviceId: string
	log?: (...message: any[]) => void
	debug?: (...message: any[]) => void
}): Promise<{ deviceId: string }> => {
	log?.(`Generating certificate for device ${deviceId}`)
	const deviceFiles = deviceFileLocations({
		certsDir,
		deviceId,
	})

	await run({
		command: 'openssl',
		args: [
			'ecparam',
			'-out',
			deviceFiles.privateKey,
			'-name',
			'prime256v1',
			'-genkey',
		],
		log: debug,
	})

	debug?.(`${deviceFiles.privateKey} written`)
	const clientKey = await fs.readFile(deviceFiles.privateKey, 'utf-8')

	const { csr } = await new Promise<{ csr: string; clientKey: string }>(
		(resolve, reject) =>
			createCSR(
				{
					commonName: deviceId,
					clientKey,
				},
				(err, cert) => {
					if (err !== null && err !== undefined) return reject(err)
					resolve(cert)
				},
			),
	)

	debug?.(csr)

	await fs.writeFile(deviceFiles.csr, csr, 'utf-8')

	return { deviceId }
}
