export function composeEventHandlers<E>(
	internal?: (event: E) => void,
	external?: (event: E) => void,
): ((event: E) => void) | undefined {
	if (!internal && !external) return undefined;

	return (event: E) => {
		internal?.(event);

		if (!(event as unknown as { defaultPrevented?: boolean }).defaultPrevented) {
			external?.(event);
		}
	};
}
