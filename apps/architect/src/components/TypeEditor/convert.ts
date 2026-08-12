// convert protocol format into editor-form format
const format = (
  configuration: Record<string, unknown>,
): Record<string, unknown> => ({
  ...configuration,
});

// convert editor-form format into protocol format
const parse = (
  configuration: Record<string, unknown>,
): Record<string, unknown> => ({
  ...configuration,
});

export { format, parse };
