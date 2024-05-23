/* eslint-disable no-process-env */

import { z } from 'zod';

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

export function getBaseUrl() {
  if (process.env.VERCEL_URL)
    // reference for vercel.com
    return `https://${process.env.VERCEL_URL}`;

  if (process.env.PUBLIC_URL)
    // Manually set deployment URL from env
    return process.env.PUBLIC_URL;

  // assume localhost
  return `http://127.0.0.1:3000`;
}

// this is a workaround for this issue:https://github.com/colinhacks/zod/issues/1630
// z.coerce.boolean() doesn't work as expected
export const strictBooleanSchema = z
  .enum(['true', 'false', 'True', 'False', 'TRUE', 'FALSE'])
  .default('false')
  .transform(
    (value) => value === 'true' || value === 'True' || value === 'TRUE',
  );
