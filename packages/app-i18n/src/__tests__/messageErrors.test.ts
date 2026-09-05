import { parse } from '@formatjs/icu-messageformat-parser';
import { describe, expect, it } from 'vitest';

import {
  createAppIntl,
  createMessageError,
  defineMessage,
  formatMessageError,
} from '../messages.ts';

const message = defineMessage({
  id: 'test.error.selected',
  defaultMessage:
    '{count, plural, one {Cannot save # record for {name}.} other {Cannot save # records for {name}.}}',
  description: 'Test submission refusal with a count and unchanged user data.',
});
const spanish =
  '{count, plural, one {No se puede guardar # registro de {name}.} other {No se pueden guardar # registros de {name}.}}';

describe('message errors across string result boundaries', () => {
  it('formats a transported list in the current language', () => {
    const listMessage = defineMessage({
      id: 'test.error.dependencies',
      defaultMessage: 'Missing dependencies: {dependencies}.',
      description:
        'Test whole error sentence with a list of unchanged identifiers.',
    });
    const error = createMessageError(listMessage, {
      dependencies: { list: ['node-a', 'node-b'] },
    });
    expect(formatMessageError(error, createAppIntl({ locale: 'en' }))).toBe(
      'Missing dependencies: node-a and node-b.',
    );
    expect(
      formatMessageError(
        error,
        createAppIntl({
          locale: 'es',
          messages: {
            [listMessage.id]: 'Dependencias ausentes: {dependencies}.',
          },
        }),
      ),
    ).toBe('Dependencias ausentes: node-a y node-b.');
  });
  it.each([message.defaultMessage, parse(message.defaultMessage)])(
    'retains source or production AST defaults without capturing a locale',
    (defaultMessage) => {
      const error = createMessageError(
        { ...message, defaultMessage },
        { count: 2, name: '<Ana>' },
      );
      expect(formatMessageError(error, createAppIntl({ locale: 'en' }))).toBe(
        'Cannot save 2 records for <Ana>.',
      );
      expect(
        formatMessageError(
          error,
          createAppIntl({ locale: 'es', messages: { [message.id]: spanish } }),
        ),
      ).toBe('No se pueden guardar 2 registros de <Ana>.');
      const one = createMessageError(
        { ...message, defaultMessage },
        { count: 1, name: 'Ana' },
      );
      expect(
        formatMessageError(
          one,
          createAppIntl({ locale: 'es', messages: { [message.id]: spanish } }),
        ),
      ).toBe('No se puede guardar 1 registro de Ana.');
    },
  );

  it.each([
    'Plain diagnostic text',
    '@codaco/app-i18n/error/v1:invalid JSON',
    '@codaco/app-i18n/error/v1:null',
    '@codaco/app-i18n/error/v1:{"message":{"id":"test.bad","defaultMessage":[{"type":99}]},"values":{}}',
    '@codaco/app-i18n/error/v1:{"message":{"id":"test.bad","defaultMessage":"Bad {value}"},"values":{"value":{}}}',
  ])('leaves unrecognized or malformed text to its caller: %s', (error) => {
    expect(
      formatMessageError(error, createAppIntl({ locale: 'en' })),
    ).toBeUndefined();
  });

  it('rejects defaults or values that cannot honor the string transport contract', () => {
    expect(() => createMessageError({ id: 'test.missing' })).toThrow(
      'English defaults',
    );
    expect(() => createMessageError(message, { count: Number.NaN })).toThrow(
      'serializable',
    );
  });
});
