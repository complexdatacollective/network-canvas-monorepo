import { get, isArray, reduce } from "es-toolkit/compat";

type PathMap = Record<string, unknown>;
type MapFunc = (value: unknown, path: string) => [unknown, string] | undefined;
type ObjPath = string | string[];
export type CollectPathsEntry = string | [string, MapFunc];

const collectPath = (objPath: ObjPath, obj: unknown, memoPath = ""): PathMap => {
	const parsedPath: string[] = isArray(objPath) ? (objPath as string[]) : (objPath as string).split("[].");
	const [first, ...rest] = parsedPath;
	let next = first ?? "";
	let scanArray = false;

	if (next.slice(-2) === "[]") {
		next = next.slice(0, -2);
		scanArray = true;
	}

	const path = memoPath ? `${memoPath}.${next}` : `${next}`;

	const nextObj = get(obj, next) as unknown[] | undefined;

	if (rest.length > 0) {
		return reduce(
			(nextObj || []) as unknown[],
			(memo: PathMap, item: unknown, index: number) => {
				const collected = collectPath(rest, item, `${path}[${index}]`);
				Object.assign(memo, collected);
				return memo;
			},
			{},
		);
	}

	// special case to parse end array
	if (Array.isArray(nextObj) && scanArray) {
		const result = reduce(
			(nextObj || []) as unknown[],
			(memo: PathMap, item: unknown, index: number) => {
				memo[`${path}[${index}]`] = item;
				return memo;
			},
			{},
		);

		return result;
	}

	if (nextObj) {
		return {
			[path]: nextObj,
		};
	}

	return {};
};

export const collectMappedPath = (paths: ObjPath, obj: unknown, mapFunc: MapFunc): PathMap => {
	const collectedPaths = collectPath(paths, obj);

	return reduce(
		collectedPaths,
		(acc: PathMap, value: unknown, path: string) => {
			const result = mapFunc(value, path);

			if (result === undefined) {
				return acc;
			}
			acc[result[1]] = result[0];
			return acc;
		},
		{},
	);
};

export const collectPaths = (objPaths: CollectPathsEntry[], object: unknown): PathMap => {
	return objPaths.reduce((acc: PathMap, objPath: CollectPathsEntry) => {
		const next = Array.isArray(objPath)
			? collectMappedPath(objPath[0], object, objPath[1])
			: collectPath(objPath, object);

		for (const key in next) {
			acc[key] = next[key];
		}
		return acc;
	}, {});
};

export default collectPath;
