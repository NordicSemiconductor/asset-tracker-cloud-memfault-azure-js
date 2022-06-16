import { packageFunctionApp } from '../dist/pack/package-function-app.js'

void packageFunctionApp({
	outFileId: 'functionapp',
	ignoreFunctions: ['mock-http-api'],
})
