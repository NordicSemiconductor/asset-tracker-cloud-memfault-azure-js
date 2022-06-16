import {
	StepRunnerFunc,
	InterpolatedStep,
	regexGroupMatcher,
} from '@nordicsemiconductor/e2e-bdd-test-runner'
import * as chai from 'chai'
import { expect } from 'chai'
import chaiSubset from 'chai-subset'
import { splitMockResponse } from '../../mock-http-api/splitMockResponse.js'
import { TableClient } from '@azure/data-tables'
import { v4 } from 'uuid'
import { sortQueryString } from '../../mock-http-api/sortQueryString.js'
chai.use(chaiSubset)

export const httpApiMockStepRunners = ({
	responsesClient,
	requestsClient,
}: {
	responsesClient: TableClient
	requestsClient: TableClient
}): ((
	step: InterpolatedStep,
) => StepRunnerFunc<Record<string, unknown>> | false)[] => {
	return [
		regexGroupMatcher(
			/^I enqueue this mock HTTP API response with status code (?<statusCode>[0-9]+) for a (?<method>[A-Z]+) request to (?<path>.+)$/,
		)(async ({ statusCode, method, path }, step) => {
			if (step.interpolatedArgument === undefined) {
				throw new Error('Must provide argument!')
			}
			const { body, headers } = splitMockResponse(step.interpolatedArgument)
			const methodPathQuery = `${method} ${sortQueryString(path)}`
			await responsesClient.createEntity({
				partitionKey: v4(),
				rowKey: encodeURIComponent(methodPathQuery),
				methodPathQuery,
				statusCode,
				body,
				headers: JSON.stringify(headers),
				ttl: Math.round(Date.now() / 1000) + 5 * 60,
			})
		}),
		regexGroupMatcher(
			/^the mock HTTP API should have been called with a (?<method>[A-Z]+) request to (?<path>.+)$/,
		)(async ({ method, path }, step) => {
			let expectedBody: Record<string, any> | undefined = undefined
			let expectedHeaders: Record<string, string> | undefined = undefined
			if (step.interpolatedArgument !== undefined) {
				const { body, headers } = splitMockResponse(step.interpolatedArgument)
				expectedBody = JSON.parse(body)
				expectedHeaders = headers
			}

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
						const actual = JSON.parse(request.body ?? '{}')
						expect(actual).to.deep.equal(expectedBody)
					}
					if (expectedHeaders !== undefined) {
						const actual = JSON.parse(request.headers ?? '{}')
						expect(actual).to.containSubset(expectedHeaders)
					}
					await requestsClient.deleteEntity(
						request.partitionKey,
						request.rowKey,
					)
					return
				} catch (err) {
					// Ignore this, there could be multiple requests that do not match
				}
			}
			throw new Error('No requests matched.')
		}),
	]
}
