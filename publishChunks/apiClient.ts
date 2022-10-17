import type { IncomingMessage } from 'http'
import type { RequestOptions } from 'https'
import { request } from 'https'

export const apiRequest = async (
	options: RequestOptions,
	payload?: string | Buffer,
): Promise<{
	res: IncomingMessage
	body: string
}> => {
	const { method, path } = options
	console.debug({
		method,
		hostname: options.hostname,
		path,
		payload,
	})
	const { res, body } = await new Promise<{
		res: IncomingMessage
		body: string
	}>((resolve, reject) => {
		const req = request(options, (res) => {
			let body = ''
			res.on('data', (chunk) => {
				body += chunk
			})
			res.on('end', () => {
				resolve({ res, body })
			})
		})
		req.on('error', reject)
		if (payload !== undefined) req.write(payload)
		req.end()
	})
	console.debug(
		JSON.stringify({
			status: res.statusCode,
			headers: res.headers,
			body,
		}),
	)
	return { res, body }
}
