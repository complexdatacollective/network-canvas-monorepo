// Variables and option values must respect NMTOKEN rules so that
// they are compatable with XML export formats

type Item = {
	attributes: Record<string, string>;
};

type Network = {
	nodes: Item[];
	edges: Item[];
};

const allowedVariableName = (value: string) => {
	if (!/^[a-zA-Z0-9._\-:]+$/.test(value)) {
		return "Not a valid variable name. Only letters, numbers and the symbols ._-: are supported.";
	}
	return undefined;
};

const getUniqueAttributes = (items: Item[]) => {
	const uniqueSet = items.reduce<Set<string>>((acc, node) => {
		for (const key of Object.keys(node.attributes)) {
			acc.add(key);
		}
		return acc;
	}, new Set([]));

	return Array.from(uniqueSet);
};

export const getVariableNamesFromNetwork = (network: Network) =>
	(["nodes", "edges"] as Array<keyof Network>).flatMap((entity) => getUniqueAttributes(network[entity] || []));

export const validateNames = (items = []) => {
	const errors = items.filter((item) => allowedVariableName(item) !== undefined);

	if (errors.length === 0) {
		return false;
	}

	return `Variable name not allowed ("${errors.join('", "')}"). Only letters, numbers and the symbols ._-: are supported.`;
};
