import { packageFunctionApp } from '../pack/package-function-app.js'

void packageFunctionApp({
	outFileId: 'functionapp',
	ignoreFunctions: ['mock-http-api'],
})
