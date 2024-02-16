import assert from 'node:assert'
import { describe, test as it } from 'node:test'
import { lowerCaseRecord } from './lowerCaseRecord.js'

void describe('lowerCaseRecord', () => {
	void it('should lower-case all keys', () =>
		assert.deepStrictEqual(
			lowerCaseRecord({
				Foo: 'Bar', // will be overwritten by the next key
				foo: 'bar',
			}),
			{ foo: 'bar' },
		))
})
