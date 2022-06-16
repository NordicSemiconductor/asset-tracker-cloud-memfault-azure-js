export const resourceGroupName = (): string =>
	process.env.RESOURCE_GROUP ?? 'memfault'

export const appName = (): string => process.env.APP_NAME ?? 'memfault'
