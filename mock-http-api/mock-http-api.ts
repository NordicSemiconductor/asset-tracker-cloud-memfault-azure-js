import { AzureNamedKeyCredential, TableClient } from '@azure/data-tables'
import { AzureFunction, Context, HttpRequest } from '@azure/functions'
import { setLogLevel } from '@azure/logger'
import { URL } from 'url'
import { v4 } from 'uuid'
import { fromEnv } from '../lib/fromEnv.js'
import { result } from '../lib/http.js'
import { log, logError } from '../lib/log.js'
import { encodeQuery } from './encodeQuery.js'
import { sortQueryString } from './sortQueryString.js'

setLogLevel('verbose')

const { storageAccessKey, storageAccountName } = fromEnv({
	storageAccountName: 'STORAGE_ACCOUNT_NAME',
	storageAccessKey: 'STORAGE_ACCESS_KEY',
})(process.env)

const createTableClient = (table: string) =>
	new TableClient(
		`https://${storageAccountName}.table.core.windows.net`,
		table,
		new AzureNamedKeyCredential(storageAccountName, storageAccessKey),
	)

const requestsClient = createTableClient('Requests')
const responsesClient = createTableClient('Responses')

const mockHTTPAPI: AzureFunction = async (
	context: Context,
	req: HttpRequest,
): Promise<void> => {
	log(context)({ req })

	try {
		const path = new URL(req.url).pathname.replace(/^\/api\//, '')
		const pathWithQuery = sortQueryString(
			`${path}${encodeQuery(req.query as Record<string, string>)}`,
		)
		const methodPathQuery = `${req.method} ${pathWithQuery}`
		const requestId = v4()
		const request = {
			partitionKey: requestId,
			rowKey: encodeURIComponent(methodPathQuery),
			method: req.method,
			path: path,
			query: JSON.stringify(req.query),
			methodPathQuery: methodPathQuery,
			headers: JSON.stringify(req.headers),
			body: JSON.stringify(req.body),
		}
		log(context)({ request })
		await requestsClient.createEntity(request)

		// Check if response exists
		log(context)(`Checking if response exists for ${methodPathQuery}...`)

		const entities = responsesClient.listEntities<{
			partitionKey: string
			rowKey: string
			methodPathQuery: string
			statusCode: number
			body?: string
			headers?: string
			ttl: number
		}>({
			queryOptions: {
				filter: `methodPathQuery eq '${methodPathQuery}' and ttl ge ${Math.floor(
					Date.now() / 1000,
				)}`,
			},
		})

		for await (const response of entities) {
			log(context)({ response })
			await responsesClient.deleteEntity(response.partitionKey, response.rowKey)
			const isBinary = /^[0-9a-f]+$/.test(response.body ?? '')
			const headers =
				response.headers !== undefined ? JSON.parse(response.headers) : {}

			if (isBinary) {
				const binaryBody = Buffer.from(response.body as string, 'hex')
				context.res = result(context)(
					binaryBody,
					response.statusCode ?? 200,
					{
						'content-type': 'application/octet-stream',
						'content-length': `${binaryBody.length}`,
						...headers,
					},
					true,
				)
			} else {
				context.res = result(context)(
					response.body ?? '',
					response.statusCode ?? 200,
					{
						'content-length': `${(response.body ?? '').length}`,
						...headers,
					},
					false,
				)
			}
			return
		}
		context.res = result(context)('', 404)
	} catch (err) {
		context.res = result(context)((err as Error).message, 500)
		logError(context)({ error: (err as Error).message })
	}
}

export default mockHTTPAPI
