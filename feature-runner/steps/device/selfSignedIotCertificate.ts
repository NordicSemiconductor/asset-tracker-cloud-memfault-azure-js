import {
	createCertificate,
	createCSR,
	createPrivateKey,
	getFingerprint,
} from 'pem'

/**
 * Create a self-signed certificate for use with Azure IoT
 *
 * @link https://docs.microsoft.com/en-us/azure/iot-hub/tutorial-x509-self-sign#step-1---create-a-key-for-the-first-certificate
 */
export const selfSignedCertificate = async ({
	deviceId,
}: {
	deviceId: string
}): Promise<{
	certificate: string
	key: string
	fingerprint: string
}> => {
	// Step 1 - Create a key for the first certificate
	// openssl genpkey -out device1.key -algorithm RSA -pkeyopt rsa_keygen_bits:2048
	const { key } = await new Promise<{ key: string }>((resolve, reject) =>
		createPrivateKey(2048, (error, result) => {
			if (error !== undefined && error !== null) return reject(error)
			resolve(result)
		}),
	)

	// Step 2 - Create a CSR for the first certificate
	// openssl req -new -key device1.key -out device1.csr
	const { csr } = await new Promise<{ csr: string }>((resolve, reject) =>
		createCSR(
			{
				commonName: deviceId,
			},
			(error, result) => {
				if (error !== undefined && error !== null) return reject(error)
				resolve(result)
			},
		),
	)

	// Step 4 - Self-sign certificate 1
	// openssl x509 -req -days 365 -in device1.csr -signkey device1.key -out device1.crt
	const { certificate } = await new Promise<{ certificate: string }>(
		(resolve, reject) =>
			createCertificate(
				{
					days: 2,
					csr,
					serviceKey: key,
				},
				(error, result) => {
					if (error !== undefined && error !== null) return reject(error)
					resolve(result)
				},
			),
	)

	const { fingerprint } = await new Promise<{ fingerprint: string }>(
		(resolve, reject) =>
			getFingerprint(certificate, (error, result) => {
				if (error !== undefined && error !== null) return reject(error)
				resolve(result)
			}),
	)

	return {
		certificate,
		key,
		fingerprint,
	}
}
