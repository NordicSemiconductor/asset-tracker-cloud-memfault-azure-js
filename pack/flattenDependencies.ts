import { TreeInnerNode } from 'dependency-tree'

export const flattenDependencies = (
	deps: TreeInnerNode,
	flatDeps = [] as string[],
): string[] => {
	for (const script of Object.keys(deps)) {
		flatDeps.push(script)
		const scriptDeps = Object.keys(deps[script])
		flatDeps.push(...scriptDeps)
		// Get children deps
		flatDeps.push(
			...Object.values(deps[script])
				.map((d) => flattenDependencies(d as TreeInnerNode))
				.flat(),
		)
	}
	return [...new Set(flatDeps.sort((a, b) => a.localeCompare(b)))]
}
