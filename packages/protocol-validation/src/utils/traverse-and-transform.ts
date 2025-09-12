type PathSegment = string | { arrayKey: true };

/**
 * Parse a path string like "stages[].panels[].filter" into segments
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

	if (typeof currentSegment === "object" && currentSegment.arrayKey) {
		// Process array elements
		if (!Array.isArray(obj)) {
			return obj;
		}

		return obj.map((item) => traverseAndApply(item, restSegments, fn));
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
 *
 * @param obj - The object to process
 * @param paths - Array of path strings (e.g., ["stages[].panels[].filter"])
 * @param fn - Function to apply to matching values
 * @returns A new object with transformations applied
 *
 * @example
 * processThing(data, ["stages[].panels[].filter"], (filter) => {
 *   // Transform the filter
 *   return modifiedFilter;
 * });
 */
export function traverseAndTransform<T>(obj: T, paths: string[], fn: <V>(value: V) => V): T {
	let result = obj as unknown;

	for (const path of paths) {
		const segments = parsePath(path);
		result = traverseAndApply(result, segments, fn);
	}

	return result as T;
}
