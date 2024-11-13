// Helper function that ensures that a value is an Error
export function ensureError(value: unknown): Error {
  if (!value) return new Error('No value was thrown');

  if (value instanceof Error) return value;

  // Test if value inherits from Error
  if (Object.prototype.isPrototypeOf.call(value, Error))
    return value as Error & typeof value;

  let stringified = '[Unable to stringify the thrown value]';
  try {
    stringified = JSON.stringify(value);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
  }

  const error = new Error(
    `This value was thrown as is, not through an Error: ${stringified}`,
  );
  return error;
}
