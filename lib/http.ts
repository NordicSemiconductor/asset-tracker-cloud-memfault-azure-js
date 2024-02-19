import { Context } from '@azure/functions'
import { log } from './log.js'
import { lowerCaseRecord } from './lowerCaseRecord.js'

export const result =
	(context: Context) =>
	(
		result: unknown,
		status = 200,
		headers?: Record<string, string>,
	): {
		headers: Record<string, string>
		status: number
		body: unknown
	} => {
		// @see https://docs.microsoft.com/en-us/azure/azure-functions/functions-reference-node?tabs=v2#response-object
		const response = {
			headers: lowerCaseRecord({
				'Content-Type': 'application/json; charset=utf-8',
				'Access-Control-Allow-Origin': '*',
				...headers,
			}),
			status,
			body: result,
			isRaw: true,
		}
		log(context)(`> Status ${response.status}`)
		for (const [k, v] of Object.entries(response.headers)) {
			log(context)(`> ${k}: ${v}`)
		}
		log(context)(`> ${JSON.stringify(result)}`)
		return response
	}
