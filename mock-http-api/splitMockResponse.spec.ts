import assert from 'node:assert'
import { describe, test as it } from 'node:test'
import { splitMockResponse } from './splitMockResponse.js'

void describe('split mock response', () => {
	void it('should parse headers and body', () =>
		assert.deepStrictEqual(
			splitMockResponse(`Content-Type: application/octet-stream

(binary A-GPS data) other types`),
			{
				headers: {
					'Content-Type': 'application/octet-stream',
				},
				body: '(binary A-GPS data) other types',
			},
		))
})
