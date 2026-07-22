// Exhaustiveness helper for discriminated-union switches: the `default` branch
// narrows the value to `never`, so adding a new variant becomes a type error
// here rather than a silent fall-through.
export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
}
