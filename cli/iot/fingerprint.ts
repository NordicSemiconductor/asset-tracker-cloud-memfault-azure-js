import { run } from '../process/run.js'

export const fingerprint = async (certLocation: string): Promise<string> =>
	(
		await run({
			command: 'openssl',
			args: [
				'x509',
				'-noout',
				'-fingerprint',
				'-sha1',
				'-inform',
				'pem',
				'-in',
				certLocation,
			],
		})
	)
		.replace('SHA1 Fingerprint=', '')
		.replace(/:/g, '')
		.trim()
