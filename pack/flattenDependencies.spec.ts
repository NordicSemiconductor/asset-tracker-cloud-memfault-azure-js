import { flattenDependencies } from './flattenDependencies'

describe('flattenDependencies', () => {
	it('should flatten dependencies', () =>
		expect(
			flattenDependencies({
				'/mock-http-api/mock-http-api.js': {
					'/lib/log.js': {},
					'/lib/http.js': {
						'/lib/log.js': {},
						'/lib/request.js': {},
					},
					'/lib/fromEnv.js': {},
				},
			}),
		).toEqual([
			'/lib/fromEnv.js',
			'/lib/http.js',
			'/lib/log.js',
			'/lib/request.js',
			'/mock-http-api/mock-http-api.js',
		]))
})
