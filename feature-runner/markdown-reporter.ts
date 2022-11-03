import { markdownReporter } from '@nordicsemiconductor/bdd-markdown'

process.stdin.on('data', (data) => {
	console.log(markdownReporter(JSON.parse(data.toString())))
})
