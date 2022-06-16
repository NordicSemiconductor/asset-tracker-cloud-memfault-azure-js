export const sortQueryString = (mockUrl: string): string => {
	const [host, query] = mockUrl.split('?')
	if ((query?.length ?? 0) === 0) return host
	const params: string[][] = []
	new URLSearchParams(query).forEach((v, k) => {
		params.push([k, v])
	})
	params.sort(([k1], [k2]) => k1.localeCompare(k2))
	const sortedParams = new URLSearchParams()
	for (const [k, v] of params) {
		sortedParams.append(k, v)
	}
	return `${host}?${sortedParams}`
}
