import { promises as fs } from 'fs'
import path from 'path'
import chalk from 'chalk'

export const copyFile = async (
	source: string,
	target: string,
): Promise<void> => {
	console.log(
		chalk.magenta('[copy]'),
		chalk.gray(source),
		chalk.magenta('->'),
		chalk.blueBright(target),
	)
	const parts = target.split(path.sep)
	const targetDir = parts.slice(0, parts.length - 1).join(path.sep)
	try {
		await fs.stat(targetDir)
	} catch {
		await fs.mkdir(targetDir, { recursive: true })
	}
	await fs.copyFile(source, target)
}

export const copy =
	(sourceDir: string, targetDir: string) =>
	async (sourceName: string): Promise<void> => {
		const source = path.resolve(sourceDir, sourceName)
		const target = path.resolve(targetDir, sourceName)
		await copyFile(source, target)
	}
