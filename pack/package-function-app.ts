/**
 * This script packages the Function App in a ZIP archive.
 *
 * This way only the neccessary files are included in the archive, where the
 * func CLI would include all files which are not explicitly ignored.
 *
 * In addition it implements a hack neccessary to make the Function App support
 * ECMAScript modules (ESM): Azure Functions expects ESM entry scripts to have
 * the extions .mjs, however TypeScript currently can only compile to .js files.
 *
 * Therefore, the scriptFiles are renamed to .mjs while packaging.
 */

import { promises as fs, statSync } from 'fs'
import { readdir } from 'fs/promises'
import os from 'os'
import path from 'path'
import { debug, progress } from '../cli/logging.js'
import { run } from '../cli/run.js'
import { copy } from './lib/copy.js'

const installDependenciesFromPackageJSON = async ({
	targetDir,
}: {
	targetDir: string
}): Promise<void> => {
	// Install production dependencies
	await run({
		command: 'npm',
		args: ['ci', '--ignore-scripts', '--only=prod', '--no-audit'],
		cwd: targetDir,
		log: (info) => progress('Installing dependencies', info),
		debug: (info) => debug('[npm]', info),
	})
}

export const installPackagesFromList =
	(packageList: string[]) =>
	async ({ targetDir }: { targetDir: string }): Promise<void> => {
		// Install production dependencies
		await run({
			command: 'npm',
			args: ['i', '--ignore-scripts', '--no-audit', ...packageList],
			cwd: targetDir,
			log: (info) => progress('Installing dependencies', info),
			debug: (info) => debug('[npm]', info),
		})
	}

export const packageFunctionApp = async ({
	outFileId,
	functions,
	ignoreFunctions,
	installDependencies,
	includeFolders,
}: {
	outFileId: string
	functions?: string[]
	ignoreFunctions?: string[]
	includeFolders?: string[]
	installDependencies?: (_: { targetDir: string }) => Promise<void>
}): Promise<string> => {
	const outFile = path.resolve(process.cwd(), 'dist', `${outFileId}.zip`)

	progress('Packaging to', outFile)

	// Find all folder names of functions (they have a function.json in it)
	if (functions === undefined) {
		const rootEntries = await fs.readdir(process.cwd())
		functions = rootEntries
			.filter((f) => !f.startsWith('.'))
			.filter((f) => statSync(path.join(process.cwd(), f)).isDirectory())
			.filter((f) => {
				try {
					return statSync(path.join(process.cwd(), f, 'function.json')).isFile()
				} catch {
					return false
				}
			})
			.filter((f) => !(ignoreFunctions ?? ([] as string[])).includes(f))
	}
	functions.forEach((f) => progress('Packaging function', f))

	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), path.sep))
	const c = copy(process.cwd(), tempDir)

	// Copy function files and additional folders
	await Promise.all(
		[...functions, ...(includeFolders ?? [])].map(async (fn) => {
			const cDist = copy(
				path.join(process.cwd(), 'dist', fn),
				path.join(tempDir, fn),
			)
			return readdir(path.join(process.cwd(), 'dist', fn)).then(async (files) =>
				Promise.all(files.map(async (file) => cDist(file))),
			)
		}),
	)

	// Copy the neccessary files for Azure IoT Hub functions
	await c('host.json')

	// ... and for installing dependencies
	await c('package.json')
	await c('package-lock.json')

	// Install the dependencies
	await (installDependencies ?? installDependenciesFromPackageJSON)({
		targetDir: tempDir,
	})

	// Azure functions expect .mjs files.
	// @see https://docs.microsoft.com/en-us/azure/azure-functions/functions-reference-node?tabs=v2#ecmascript-modules
	// Copy function.json and handler.mjs
	progress('Packaging app', 'Copying function definition')
	await Promise.all(
		functions.map(async (f) => {
			const functionFolder = path.resolve(tempDir, f)
			try {
				await fs.stat(functionFolder)
			} catch {
				await fs.mkdir(functionFolder)
			}
			await fs.copyFile(
				path.join(process.cwd(), f, 'function.json'),
				path.resolve(tempDir, f, 'function.json'),
			)
			await fs.copyFile(
				path.join(process.cwd(), f, 'handler.mjs'),
				path.resolve(tempDir, f, 'handler.mjs'),
			)
		}),
	)

	// ZIP everything
	await run({
		command: 'zip',
		args: ['-r', outFile, './'],
		cwd: tempDir,
		log: (info) => progress('[ZIP]', info),
	})

	// Remove the temp folder
	await run({
		command: 'rm',
		args: ['-rf', tempDir],
		log: (info) => progress('Cleanup', info),
	})

	return outFile
}
