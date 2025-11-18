type PathSegment = string | { arrayKey: true } | { wildcardKey: true };

/**
 * Parse a path string like "stages[].panels[].filter" into segments
 * Supports wildcard notation with * to match all keys in an object
 */
function parsePath(path: string): PathSegment[] {
	const segments: PathSegment[] = [];
	const parts = path.split(".");

	for (const part of parts) {
		if (part.endsWith("[]")) {
			// Array element access
			const key = part.slice(0, -2);
			if (key) {
				segments.push(key);
			}
			segments.push({ arrayKey: true });
		} else if (part === "*") {
			// Wildcard - match all keys in an object
			segments.push({ wildcardKey: true });
		} else {
			segments.push(part);
		}
	}

	return segments;
}

/**
 * Recursively traverse an object/array and apply a function to matching paths
 */
function traverseAndApply(obj: unknown, remainingSegments: PathSegment[], fn: (value: unknown) => unknown): unknown {
	if (remainingSegments.length === 0) {
		// We've reached the target - apply the function
		return fn(obj);
	}

	const [currentSegment, ...restSegments] = remainingSegments;

	if (typeof currentSegment === "object" && "arrayKey" in currentSegment) {
		// Process array elements
		if (!Array.isArray(obj)) {
			return obj;
		}

		return obj.map((item) => traverseAndApply(item, restSegments, fn));
	}

	if (typeof currentSegment === "object" && "wildcardKey" in currentSegment) {
		// Process all keys in the object
		if (typeof obj !== "object" || obj === null) {
			return obj;
		}

		const objAsRecord = obj as Record<string, unknown>;
		const result: Record<string, unknown> = {};

		for (const [key, value] of Object.entries(objAsRecord)) {
			result[key] = traverseAndApply(value, restSegments, fn);
		}

		return result;
	}

	// Process object property
	if (typeof obj !== "object" || obj === null) {
		return obj;
	}

	const objAsRecord = obj as Record<string, unknown>;

	if (typeof currentSegment !== "string" || !(currentSegment in objAsRecord)) {
		return obj;
	}

	// Create a new object with the modified property
	return {
		...objAsRecord,
		[currentSegment]: traverseAndApply(objAsRecord[currentSegment], restSegments, fn),
	};
}

/**
 * Process an object by applying a transformation function to values at specified paths.
 * Supports array notation with [] to process all elements in an array.
 * Supports wildcard notation with * to process all keys in an object.
 *
 * @param obj - The object to process
 * @param transformations - Array of path-function pairs to apply
 * @returns A new object with transformations applied
 *
 * @example
 * // Array notation
 * traverseAndTransform(data, [
 *   {
 *     paths: ["stages[].panels[].filter"],
 *     fn: (filter) => modifiedFilter
 *   }
 * ]);
 *
 * @example
 * // Wildcard notation
 * traverseAndTransform(data, [
 *   {
 *     paths: ["codebook.node.*"],
 *     fn: (entityDefinition) => modifiedDefinition
 *   }
 * ]);
 */
export function traverseAndTransform<T>(
	obj: T,
	transformations: Array<{ paths: string[]; fn: <V>(value: V) => V }>,
): T {
	let result = obj;
	for (const { paths, fn } of transformations) {
		for (const path of paths) {
			if (path === "") {
				// Handle root-level transformation
				result = fn(result) as T;
			} else {
				const segments = parsePath(path);
				result = traverseAndApply(result, segments, fn) as T;
			}
		}
	}
	return result;
}
