import { apiRequest } from './apiClient.js'

export const publishMemfaultChunks =
	({
		chunksEndpoint,
		projectKey,
	}: {
		chunksEndpoint?: string
		projectKey: string
	}) =>
	async ({
		device,
		chunk,
	}: {
		device: string
		chunk: Buffer
	}): Promise<ReturnType<typeof apiRequest>> => {
		const endpoint = new URL(chunksEndpoint ?? 'https://chunks.memfault.com')
		const base = (endpoint.pathname ?? '').replace(/\+$/, '')
		return apiRequest(
			{
				hostname: endpoint.hostname,
				port: 443,
				path: `${base}/api/v0/chunks/${device}`,
				method: 'POST',
				headers: {
					'Content-Type': 'application/octet-stream',
					'Content-Length': chunk.length,
					'Memfault-Project-Key': projectKey,
				},
			},
			chunk,
		)
	}
