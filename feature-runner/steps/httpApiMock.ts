import { TableClient } from '@azure/data-tables'
import {
	codeBlockOrThrow,
	matchGroups,
	noMatch,
	StepRunner,
	StepRunResult,
} from '@nordicsemiconductor/bdd-markdown'
import { Type } from '@sinclair/typebox'
import * as chai from 'chai'
import { expect } from 'chai'
import chaiSubset from 'chai-subset'
import { ulid } from '../../lib/ulid.js'
import { sortQueryString } from '../../mock-http-api/sortQueryString.js'
import { splitMockResponse } from '../../mock-http-api/splitMockResponse.js'
chai.use(chaiSubset)

enum Method {
	GET = 'GET',
	POST = 'POST',
	PATCH = 'PATCH',
	PUT = 'PUT',
	DELETE = 'DELETE',
}

export const httpApiMockStepRunners = ({
	responsesClient,
	requestsClient,
}: {
	responsesClient: TableClient
	requestsClient: TableClient
}): StepRunner<Record<string, unknown>>[] => [
	async ({ step }): Promise<StepRunResult> => {
		const match = matchGroups(
			Type.Object({
				statusCode: Type.Integer({ minimum: 100 }),
				method: Type.Enum(Method),
				path: Type.String({ minLength: 1 }),
			}),
			{
				statusCode: (s) => parseInt(s, 10),
			},
		)(
			/^I enqueue this mock HTTP API response with status code `(?<statusCode>[0-9]+)` for a `(?<method>[A-Z]+)` request to `(?<path>.+)`$/,
			step.title,
		)
		if (match === null) return noMatch
		const { statusCode, method, path } = match
		const { body, headers } = splitMockResponse(codeBlockOrThrow(step).code)

		const methodPathQuery = `${method} ${sortQueryString(path)}`
		await responsesClient.createEntity({
			partitionKey: ulid(),
			rowKey: encodeURIComponent(methodPathQuery),
			methodPathQuery,
			statusCode,
			body,
			headers: JSON.stringify(headers),
			ttl: Math.round(Date.now() / 1000) + 5 * 60,
		})
	},
	async ({ step }): Promise<StepRunResult> => {
		const match = matchGroups(
			Type.Object({
				method: Type.Enum(Method),
				path: Type.String({ minLength: 1 }),
			}),
		)(
			/^the mock HTTP API should have been called with a `(?<method>[A-Z]+)` request to `(?<path>.+)`$/,
			step.title,
		)
		if (match === null) return noMatch

		let expectedBody: Record<string, any> | undefined = undefined
		let expectedHeaders: Record<string, string> | undefined = undefined
		let isJSON = false
		if (step.codeBlock !== undefined) {
			const { body, headers } = splitMockResponse(step.codeBlock.code)
			isJSON = headers['Content-Type']?.includes('application/json')
			expectedBody = isJSON ? JSON.parse(body) : body
			expectedHeaders = headers
		}

		const { method, path } = match

		const filter = `methodPathQuery eq '${method} ${sortQueryString(
			path,
		)}' and Timestamp ge datetime'${new Date(
			Date.now() - 5 * 60 * 1000,
		).toISOString()}'`

		const res = requestsClient.listEntities<{
			partitionKey: string
			rowKey: string
			methodPathQuery: string
			statusCode: number
			body: string
			headers: string
			ttl: number
		}>({
			queryOptions: {
				filter,
			},
		})

		for await (const request of res) {
			try {
				if (expectedBody !== undefined) {
					const actual = isJSON
						? JSON.parse(request.body ?? '{}')
						: request.body
					expect(actual).to.deep.equal(expectedBody)
				}
				if (expectedHeaders !== undefined) {
					const actual = JSON.parse(request.headers ?? '{}')
					expect(actual).to.containSubset(expectedHeaders)
				}
				await requestsClient.deleteEntity(request.partitionKey, request.rowKey)
				return
			} catch (err) {
				// Ignore this, there could be multiple requests that do not match
			}
		}
		throw new Error('No requests matched.')
	},
]
