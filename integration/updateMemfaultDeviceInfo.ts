import { apiRequest } from '../lib/apiClient.js'

export const updateMemfaultDeviceInfo =
	({
		apiEndpoint,
		organization,
		authToken,
		project,
	}: {
		apiEndpoint?: string
		authToken: string
		organization: string
		project: string
	}) =>
	async ({
		device,
		update,
		debug,
	}: {
		device: string
		update: Partial<{
			hardware_version: string // e.g. 'evt'
			cohort: string // e.g. 'internal'
			nickname: string // e.g. 'INTERNAL-1234'
			description: string // e.g. 'Kitchen Smart Sink'
		}>
		debug?: (...args: any[]) => void
	}): Promise<ReturnType<typeof apiRequest>> => {
		const payload = JSON.stringify(update)
		const endpoint = new URL(apiEndpoint ?? 'https://api.memfault.com')
		const base = (endpoint.pathname ?? '').replace(/\/+$/, '')
		return apiRequest(
			{
				hostname: endpoint.hostname,
				port: 443,
				path: `${base}/api/v0/organizations/${organization}/projects/${project}/devices/${device}`,
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json; charset=utf-8',
					'Content-Length': payload.length,
					Authorization: `Basic ${Buffer.from(`:${authToken}`).toString(
						'base64',
					)}`,
				},
			},
			payload,
			debug,
		)
	}
