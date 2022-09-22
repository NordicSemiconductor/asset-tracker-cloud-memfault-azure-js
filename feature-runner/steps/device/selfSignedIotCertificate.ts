import { execFile } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const openssl = async (...args: string[]): Promise<string> =>
	new Promise((resolve, reject) => {
		execFile(
			'openssl',
			args,
			{
				timeout: 60 * 1000,
			},
			(err, stdout, stderr) => {
				if (err !== null) {
					console.error(`Failed`, 'openssl', ...args)
					return reject(stderr)
				}
				return resolve(stdout)
			},
		)
	})

const createKey = async (out: string) =>
	openssl(
		'genpkey',
		'-out',
		out,
		'-algorithm',
		'RSA',
		'-pkeyopt',
		'rsa_keygen_bits:2048',
	)

const fingerprint = async (certificate: string) => {
	return (await openssl('x509', '-in', certificate, '-noout', '-fingerprint'))
		.trim()
		.split('=')[1]
		.replace(/:/g, '')
}

/**
 * Create a self-signed certificate for use with Azure IoT
 *
 * @link https://docs.microsoft.com/en-us/azure/iot-hub/tutorial-x509-self-sign#step-1---create-a-key-for-the-first-certificate
 */
export const selfSignedCertificate = async ({
	commonName,
}: {
	commonName: string
}): Promise<{
	certificate: string
	key: string
	fingerprint: string
}> => {
	const tempDir = await mkdtemp(path.join(os.tmpdir(), 'memfault-certs-'))
	const version = await openssl('version')
	if (!version.includes('OpenSSL 3')) {
		throw new Error(`Expected OpenSSL version 3.x, got ${version}!`)
	}

	// Step 1 - Create a key for the first certificate
	const key = path.join(tempDir, 'certificate.key')
	await createKey(key)

	// Step 2 - Create a CSR for the first certificate
	// openssl req -new -key device1.key -out device1.csr
	const csr = path.join(tempDir, 'certificate.csr')
	await openssl(
		'req',
		'-new',
		'-key',
		key,
		'-out',
		csr,
		'-subj',
		`/CN=${commonName}`,
	)

	// Step 3 - Check the CSR
	await openssl('req', '-text', '-in', csr, '-noout')

	// Step 4 - Self-sign certificate 1
	const certificate = path.join(tempDir, 'certificate.crt')
	await openssl(
		'x509',
		'-req',
		'-days',
		'2',
		'-in',
		csr,
		'-signkey',
		key,
		'-out',
		certificate,
	)

	return {
		certificate: await readFile(certificate, 'utf-8'),
		key: await readFile(key, 'utf-8'),
		fingerprint: await fingerprint(certificate),
	}
}

export const verificationCert = async ({
	commonName: verificationCode,
	privateKey,
}: {
	commonName: string
	privateKey: string
}): Promise<{ certificate: string }> => {
	const tempDir = await mkdtemp(
		path.join(os.tmpdir(), 'memfault-verification-certs-'),
	)
	const privateKeyFile = path.join(tempDir, 'certificate.key')
	await writeFile(privateKeyFile, privateKey, 'utf-8')
	const csr = path.join(tempDir, 'certificate.csr')
	await openssl(
		'req',
		'-new',
		'-key',
		privateKeyFile,
		'-out',
		csr,
		'-subj',
		`/CN=${verificationCode}`,
	)

	const certificate = path.join(tempDir, 'certificate.csr')
	await openssl(
		'x509',
		'-req',
		'-days',
		'2',
		'-in',
		csr,
		'-signkey',
		privateKeyFile,
		'-out',
		certificate,
	)

	return {
		certificate: await readFile(certificate, 'utf-8'),
	}
}
