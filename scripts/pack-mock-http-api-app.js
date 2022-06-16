import {
	packageFunctionApp,
	installPackagesFromList,
} from '../dist/pack/package-function-app.js'

void packageFunctionApp({
	outFileId: 'mock-http-api',
	functions: ['mock-http-api'],
	installDependencies: installPackagesFromList([
		'@azure/functions',
		'@azure/data-tables',
		'@azure/logger',
		'uuid',
	]),
})
