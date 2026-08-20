import { describe, expect, it } from 'vitest';

import { ensureError } from '../ensure-error.ts';

describe('ensureError', () => {
  describe('values that are already errors', () => {
    it('returns a real Error unchanged', () => {
      const error = new Error('Test error');
      expect(ensureError(error)).toBe(error);
    });

    it('returns an Error subclass instance unchanged', () => {
      const typeError = new TypeError('Type error occurred');
      expect(ensureError(typeError)).toBe(typeError);

      const rangeError = new RangeError('Range exceeded');
      expect(ensureError(rangeError)).toBe(rangeError);
    });

    it('returns a custom Error subclass unchanged', () => {
      class CustomError extends Error {
        code: string;
        constructor(message: string, code: string) {
          super(message);
          this.code = code;
          this.name = 'CustomError';
        }
      }

      const customError = new CustomError('Custom error message', 'CUSTOM_001');
      const result = ensureError(customError);
      expect(result).toBe(customError);
      expect(result.message).toBe('Custom error message');
    });

    it('preserves a hand-set stack', () => {
      const error = new Error('Original message');
      error.stack = 'Custom stack trace';
      expect(ensureError(error).stack).toBe('Custom stack trace');
    });
  });

  describe('error-shaped plain objects', () => {
    // `dispatch(thunk).unwrap()` rethrows Redux Toolkit's SerializedError: a
    // PLAIN OBJECT carrying name/message/stack. Stringifying it put the whole
    // stack trace inside the new Error's `message`, which call sites show to
    // the user in a dialog.
    it('rebuilds a real Error without leaking the stack into the message', () => {
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

    it('ignores a non-string name or stack rather than assigning it', () => {
      const error = ensureError({ message: 'Odd shape', name: 7, stack: {} });

      expect(error.message).toBe('Odd shape');
      expect(error.name).toBe('Error');
      expect(typeof error.stack === 'string' || error.stack === undefined).toBe(
        true,
      );
    });

    it('describes an object whose message is not a string', () => {
      const error = ensureError({ message: 42 });

      expect(error.message).toContain(
        'This value was thrown as is, not through an Error',
      );
    });
  });

  describe('empty throws', () => {
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['an empty string', ''],
      ['zero', 0],
      ['false', false],
      ['NaN', Number.NaN],
    ])('describes %s', (_label, value) => {
      const result = ensureError(value);
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe('No value was thrown');
    });
  });

  describe('values that are not errors at all', () => {
    it('stringifies a string', () => {
      const result = ensureError('Something went wrong');
      expect(result.message).toContain(
        'This value was thrown as is, not through an Error',
      );
      expect(result.message).toContain('"Something went wrong"');
    });

    it('stringifies a number', () => {
      expect(ensureError(42).message).toContain('42');
    });

    it('stringifies a boolean', () => {
      expect(ensureError(true).message).toContain('true');
    });

    it('stringifies a plain object with no message', () => {
      const obj = { code: 'ERR_001', details: 'Something failed' };
      expect(ensureError(obj).message).toContain(JSON.stringify(obj));
    });

    it('stringifies an array', () => {
      const arr = ['error1', 'error2'];
      expect(ensureError(arr).message).toContain(JSON.stringify(arr));
    });

    it('stringifies a deeply nested object', () => {
      const complexObj = {
        level1: { level2: { level3: { value: 'deep' } } },
        array: [1, 2, 3],
      };
      expect(ensureError(complexObj).message).toContain(
        JSON.stringify(complexObj),
      );
    });

    it('stringifies a Date', () => {
      const date = new Date('2024-01-01');
      expect(ensureError(date).message).toContain(JSON.stringify(date));
    });

    it('describes a RegExp', () => {
      expect(ensureError(/test/g).message).toContain(
        'This value was thrown as is, not through an Error',
      );
    });

    it('describes a symbol', () => {
      // JSON.stringify returns undefined for a symbol rather than throwing.
      expect(ensureError(Symbol('test')).message).toContain(
        'This value was thrown as is, not through an Error',
      );
    });

    it('handles circular references gracefully', () => {
      const circular: { prop?: unknown } = {};
      circular.prop = circular;

      expect(ensureError(circular).message).toMatch(
        /^This value was thrown as is, not through an Error: \[Unable to stringify the thrown value\]$/,
      );
    });
  });
});
