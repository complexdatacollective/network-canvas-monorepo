// A plain object carrying an Error's shape without being one. Redux Toolkit
// rethrows exactly this from `.unwrap()` (its `SerializedError`), so it is the
// value most caught errors in this app actually arrive as.
type SerializedErrorLike = {
  message: string;
  name?: unknown;
  stack?: unknown;
};

const isSerializedErrorLike = (value: object): value is SerializedErrorLike =>
  'message' in value && typeof value.message === 'string';

// Helper function that ensures that a value is an Error
export function ensureError(value: unknown): Error {
  if (!value) return new Error('No value was thrown');

  if (value instanceof Error) return value;

  // Test if value inherits from Error
  if (Object.prototype.isPrototypeOf.call(Error, value))
    return value as Error & typeof value;

  // Rebuild a real Error from an Error-shaped object rather than stringifying
  // it. Stringifying put the whole object — including its stack trace — inside
  // the new Error's `message`, which callers show to the user. The stack is
  // preserved on the Error object, where the reporter still reads it, and out
  // of the message, where it never belonged.
  if (typeof value === 'object' && isSerializedErrorLike(value)) {
    const error = new Error(value.message);
    if (typeof value.name === 'string') error.name = value.name;
    if (typeof value.stack === 'string') error.stack = value.stack;
    return error;
  }

  let stringified = '[Unable to stringify the thrown value]';
  try {
    stringified = JSON.stringify(value);
  } catch {
    // Ignore errors during JSON.stringify
  }

  const error = new Error(
    `This value was thrown as is, not through an Error: ${stringified}`,
  );
  return error;
}
