import { apiRequest } from '../lib/apiClient.js'

export const createMemfaultHardwareVersion =
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
		hardware_version,
	}: {
		hardware_version: string
	}): Promise<ReturnType<typeof apiRequest>> => {
		const endpoint = new URL(apiEndpoint ?? 'https://api.memfault.com')
		const base = (endpoint.pathname ?? '').replace(/\/+$/, '')
		const { body } = await apiRequest({
			hostname: endpoint.hostname,
			port: 443,
			path: `${base}/api/v0/organizations/${organization}/projects/${project}/software_types?page=1&per_page=5000`,
			method: 'GET',
			headers: {
				Authorization: `Basic ${Buffer.from(`:${authToken}`).toString(
					'base64',
				)}`,
			},
		})

		try {
			const software_types = JSON.parse(body) as {
				data: {
					archived: boolean
					created_date: string // e.g. '2022-03-16T08:48:16.115301+00:00',
					id: number // e.g. 20069,
					latest_software_version: null | {
						archived: boolean
						created_date: string // e.g. '2022-03-16T08:48:16.115301+00:00',
						id: number // e.g. 137904,
						revision: string // e.g. '',
						software_type: {
							id: number // e.g. 20046,
							name: string // e.g. 'asset_tracker_v2'
						}
						symbol_file: {
							downloadable: boolean
							id: number // e.g. 127923
						}
						updated_date: string // e.g. '2022-03-16T08:48:16.115301+00:00',
						version: string // e.g. '0.0.0-development-thingy91_nrf9160_ns-debugWithMemfault'
					}
					name: string // e.g. '0.0.0-development-48b1d466fb320151a2c7a2005e58c2cfa74974d2-thingy91_nrf9160_ns-debugWithMemfault'
					software_version_string_format: null // FIXME: what does this do?
					software_versions_count: number // e.g. 0
				}[]
				paging: {
					item_count: number //e.g. 3
					page: number //e.g. 1
					page_count: number //e.g. 1
					per_page: number //e.g. 5000
					total_count: number //e.g. 3
				}
			}
			const payload = JSON.stringify({
				name: hardware_version,
				primary_software_type: software_types.data[0].name,
			})
			return apiRequest(
				{
					hostname: endpoint.hostname,
					port: 443,
					path: `${base}/api/v0/organizations/${organization}/projects/${project}/hardware_versions`,
					method: 'POST',
					headers: {
						'Content-Type': 'application/json; charset=utf-8',
						'Content-Length': payload.length,
						Authorization: `Basic ${Buffer.from(`:${authToken}`).toString(
							'base64',
						)}`,
					},
				},
				payload,
			)
		} catch (err) {
			console.error(`failed to fetch software_types: ${(err as Error).message}`)
			throw err
		}
	}
