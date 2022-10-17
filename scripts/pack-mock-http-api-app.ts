import {
	installPackagesFromList,
	packageFunctionApp,
} from '../pack/package-function-app.js'

void packageFunctionApp({
	outFileId: 'mock-http-api',
	functions: ['mock-http-api'],
	includeFolders: ['lib'],
	installDependencies: installPackagesFromList([
		'@azure/functions',
		'@azure/data-tables',
		'@azure/logger',
		'id128',
	]),
})
