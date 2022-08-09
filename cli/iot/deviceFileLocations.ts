import * as path from 'path'

export const deviceFileLocations = ({
	certsDir,
	deviceId,
}: {
	certsDir: string
	deviceId: string
}): {
	privateKey: string
	cert: string
	caCertificateChain: string
	certWithChain: string
	registration: string
	intermediateCertId: string
	json: string
	csr: string
} => ({
	privateKey: path.resolve(certsDir, `device-${deviceId}.key`),
	cert: path.resolve(certsDir, `device-${deviceId}.pem`),
	caCertificateChain: path.resolve(certsDir, `device-${deviceId}.ca.pem`),
	certWithChain: path.resolve(certsDir, `device-${deviceId}.bundle.pem`),
	registration: path.resolve(certsDir, `device-${deviceId}.registration.json`),
	intermediateCertId: path.resolve(
		certsDir,
		`device-${deviceId}.intermediateCertId`,
	),
	json: path.resolve(certsDir, `device-${deviceId}.json`),
	csr: path.resolve(certsDir, `device-${deviceId}.csr`),
})
