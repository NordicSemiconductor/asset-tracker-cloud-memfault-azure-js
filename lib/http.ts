import { Context } from '@azure/functions'
import { log } from './log.js'
import { lowerCaseRecord } from './lowerCaseRecord.js'

export const result =
	(context: Context) =>
	(
		result: unknown,
		status = 200,
		headers?: Record<string, string>,
		isRaw = false,
	): {
		headers: Record<string, string>
		status: number
		body: unknown
		isRaw: boolean
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
			isRaw,
		}
		log(context)(
			[
				`> Status ${response.status}`,
				Object.entries(response.headers).map(([k, v]) =>
					log(context)(`> ${k}: ${v}`),
				),
				'',
				JSON.stringify(result),
			].join('\n'),
		)
		return response
	}
