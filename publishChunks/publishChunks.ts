import { AzureFunction, Context } from '@azure/functions'
import { log } from '../lib/log.js'

/**
 * Publishes memfault chunk messages to the chunks API.
 */
const publishChunksHandler: AzureFunction = async (
	context: Context,
	requests: any,
): Promise<void> => {
	log(context)({ context, requests })
}

export default publishChunksHandler
