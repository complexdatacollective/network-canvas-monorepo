// convert protocol format into redux-form compatible format
const format = (configuration: Record<string, unknown>): Record<string, unknown> => ({
	...configuration,
});

// convert redux-form format into protocol format
const parse = (configuration: Record<string, unknown>): Record<string, unknown> => ({
	...configuration,
});

export { format, parse };
