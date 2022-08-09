import { promises as fs } from 'fs'
import { writeFile } from 'fs/promises'
import * as os from 'os'
import { CertificateCreationResult, createCertificate } from 'pem'
import {
	CAIntermediateFileLocations,
	CARootFileLocations,
} from './caFileLocations.js'
import { deviceFileLocations } from './deviceFileLocations.js'
import { fingerprint } from './fingerprint.js'
import { leafCertConfig } from './pemConfig.js'

export const defaultDeviceCertificateValidityInDays = 10950

/**
 * Generates a certificate for a device, signed with the CA
 */
export const generateDeviceCertificate = async ({
	certsDir,
	log,
	debug,
	deviceId,
	intermediateCertId,
	daysValid,
}: {
	certsDir: string
	deviceId: string
	intermediateCertId: string
	log?: (...message: any[]) => void
	debug?: (...message: any[]) => void
	daysValid?: number
}): Promise<{ deviceId: string }> => {
	log?.(`Generating certificate for device ${deviceId}`)
	const caRootFiles = CARootFileLocations(certsDir)
	const caIntermediateFiles = CAIntermediateFileLocations({
		certsDir,
		id: intermediateCertId,
	})
	const deviceFiles = deviceFileLocations({
		certsDir,
		deviceId,
	})

	debug?.(
		`Intermediate certificate fingerprint`,
		await fingerprint(caIntermediateFiles.cert),
	)
	const [intermediatePrivateKey, intermediateCert, rootCert, csr] =
		await Promise.all([
			fs.readFile(caIntermediateFiles.privateKey, 'utf-8'),
			fs.readFile(caIntermediateFiles.cert, 'utf-8'),
			fs.readFile(caRootFiles.cert, 'utf-8'),
			fs.readFile(deviceFiles.csr, 'utf-8'),
		])

	const deviceCert = await new Promise<CertificateCreationResult>(
		(resolve, reject) =>
			createCertificate(
				{
					commonName: deviceId,
					serial: Math.floor(Math.random() * 1000000000),
					days: daysValid ?? defaultDeviceCertificateValidityInDays,
					config: leafCertConfig(deviceId),
					serviceKey: intermediatePrivateKey,
					serviceCertificate: intermediateCert,
					csr,
				},
				(err, cert) => {
					if (err !== null && err !== undefined) return reject(err)
					resolve(cert)
				},
			),
	)

	debug?.(deviceCert.certificate)

	await Promise.all([
		writeFile(deviceFiles.cert, deviceCert.certificate, 'utf-8').then(() => {
			debug?.(`${deviceFiles.cert} written`)
		}),
		writeFile(
			deviceFiles.caCertificateChain,
			[intermediateCert, rootCert].join(os.EOL),
			'utf-8',
		).then(() => {
			debug?.(`${deviceFiles.caCertificateChain} written`)
		}),
		writeFile(
			deviceFiles.certWithChain,
			[deviceCert.certificate, intermediateCert, rootCert].join(os.EOL),
			'utf-8',
		).then(() => {
			debug?.(`${deviceFiles.certWithChain} written`)
		}),
		fs
			.writeFile(deviceFiles.intermediateCertId, intermediateCertId, 'utf-8')
			.then(() => {
				debug?.(`${deviceFiles.intermediateCertId} written`)
			}),
	])

	return { deviceId }
}
