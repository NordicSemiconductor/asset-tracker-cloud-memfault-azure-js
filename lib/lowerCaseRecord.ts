export const lowerCaseRecord = (
	headers: Record<string, string>,
): Record<string, string> =>
	Object.entries(headers).reduce(
		(headers, [k, v]) => ({
			...headers,
			[k.toLowerCase()]: v,
		}),
		{} as Record<string, string>,
	)
