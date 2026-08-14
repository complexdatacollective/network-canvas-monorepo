import { describe, expect, it } from 'vitest';

import { ensureError } from '../ensureError';

describe('ensureError', () => {
  it('returns a real Error unchanged', () => {
    const error = new Error('boom');
    expect(ensureError(error)).toBe(error);
  });

  // `dispatch(thunk).unwrap()` rethrows Redux Toolkit's SerializedError: a
  // PLAIN OBJECT carrying name/message/stack. Stringifying it put the whole
  // stack trace inside the new Error's `message`, which call sites show to the
  // user in a dialog.
  it('rebuilds a real Error from a serialized error without leaking its stack into the message', () => {
    const serialized = {
      name: 'Error',
      message: 'No active protocol to export',
      stack:
        'Error: No active protocol to export\n    at http://localhost:5277/src/ducks/modules/userActions/userActions.ts:328:9',
    };

    const error = ensureError(serialized);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('No active protocol to export');
    expect(error.message).not.toContain('{');
    expect(error.message).not.toMatch(/at https?:\/\//);
    expect(error.name).toBe('Error');
    // The stack still reaches the reporter, just not the user.
    expect(error.stack).toBe(serialized.stack);
  });

  it('keeps the message when a serialized error carries no stack', () => {
    const error = ensureError({ message: 'Something failed' });

    expect(error.message).toBe('Something failed');
    expect(error.name).toBe('Error');
  });

  it('describes a thrown value that has no message at all', () => {
    const error = ensureError({ status: 500 });

    expect(error.message).toContain(
      'This value was thrown as is, not through an Error',
    );
  });

  it('describes an empty throw', () => {
    expect(ensureError(undefined).message).toBe('No value was thrown');
  });
});
