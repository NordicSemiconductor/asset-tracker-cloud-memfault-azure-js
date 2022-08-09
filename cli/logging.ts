import chalk from 'chalk'

export const log = (...message: any[]): void => {
	console.error(...message.map((m) => chalk.magenta(m)))
}

export const debug = (...message: any[]): void => {
	console.error(...message.map((m) => chalk.cyan(m)))
}

export const success = (...message: any[]): void => {
	console.error(...message.map((m) => chalk.green(m)))
}

const settingsKey = chalk.yellow
const settingsValue = chalk.blueBright

export const setting = (property: string, value: string): void => {
	console.error(settingsKey(`${property}:`), settingsValue(value))
}

export const settings = (s: Record<string, any>): void => {
	const maxKeyLen = Object.keys(s).reduce(
		(len, k) => (k.length > len ? k.length : len),
		0,
	)
	Object.entries(s).forEach(([k, v]) =>
		console.error(
			settingsKey(`${k}:`.padEnd(maxKeyLen + 1, ' ')),
			settingsValue(v),
		),
	)
}

export const next = (instructions: string, cmd: string): void => {
	console.error(chalk.green(instructions), chalk.blueBright(cmd))
}

export const error = (message: string): void => {
	console.error(chalk.red.inverse(' ERROR '), chalk.red(message))
}

export const warn = (message: string): void => {
	console.error(chalk.yellow.inverse(' WARNING '), chalk.yellow(message))
}

export const help = (message: string): void => {
	console.error('')
	console.error(chalk.yellow(message))
	console.error('')
}

export const progress = (label: string, info: string): void => {
	console.error(chalk.magenta(label), chalk.blue(info))
}

export const newline = (): void => {
	console.error()
}

export const heading = (name: string): void => {
	newline()
	console.error(chalk.white.bold(`${name}:`))
	newline()
}
