export const encodeQuery = (query: Record<string, string>): string =>
	Object.keys(query).length === 0
		? ''
		: `?${new URLSearchParams(query).toString()}`
