import type * as IntlMessageFormatModule from 'intl-messageformat';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FIRST_STRONG_ISOLATE as FSI,
  POP_DIRECTIONAL_ISOLATE as PDI,
} from '@codaco/app-i18n/messages';

import { createLocalizedMessageFormatter } from '../messageFormatter';

const constructed = vi.hoisted((): { locales: unknown[] } => ({ locales: [] }));

vi.mock('intl-messageformat', async (importOriginal) => {
  const actual: typeof IntlMessageFormatModule = await importOriginal();
  class CountingIntlMessageFormat extends actual.IntlMessageFormat {
    constructor(
      ...args: ConstructorParameters<typeof actual.IntlMessageFormat>
    ) {
      super(...args);
      constructed.locales.push(args[1]);
    }
  }
  return { ...actual, IntlMessageFormat: CountingIntlMessageFormat };
});

beforeEach(() => {
  constructed.locales = [];
});

describe('createLocalizedMessageFormatter', () => {
  it('parses each message once per locale', () => {
    const format = createLocalizedMessageFormatter();

    expect(format('en', "Use '{'name'}'")).toBe('Use {name}');
    expect(format('en', "Use '{'name'}'")).toBe('Use {name}');
    expect(constructed.locales).toEqual(['en']);

    expect(format('es', "Use '{'name'}'")).toBe('Use {name}');
    expect(format('en', 'Another message')).toBe('Another message');
    expect(constructed.locales).toEqual(['en', 'es', 'en']);
  });

  it('keeps tags as literal text', () => {
    const format = createLocalizedMessageFormatter();

    expect(format('en', 'First line<br>second <b>line</b>')).toBe(
      'First line<br>second <b>line</b>',
    );
  });

  it('keeps a separate cache for each formatter', () => {
    createLocalizedMessageFormatter()('en', 'Shared message');
    createLocalizedMessageFormatter()('en', 'Shared message');

    expect(constructed.locales).toEqual(['en', 'en']);
  });

  it('formats a message with the values of its arguments, in the plural rules of its locale', () => {
    const format = createLocalizedMessageFormatter();
    const message =
      '{isYou, select, true {Add your parents} other {{missing, plural, one {Add a parent for {name}} other {Add # parents for {name}}}}}';

    expect(
      format('en', message, { isYou: 'false', name: 'Rob', missing: 1 }),
    ).toBe('Add a parent for Rob');
    expect(
      format('en', message, { isYou: 'false', name: 'Rob', missing: 2 }),
    ).toBe('Add 2 parents for Rob');
    expect(
      format('en', message, { isYou: 'true', name: 'Rob', missing: 2 }),
    ).toBe('Add your parents');
    // One parse serves every set of values.
    expect(constructed.locales).toEqual(['en']);
  });

  it('chooses the plural of a researcher’s message by the rules of the language holding it', () => {
    const format = createLocalizedMessageFormatter();
    expect(
      format('ja', '{count, plural, one {# item} other {# items}}', {
        count: 1,
      }),
    ).toBe('1 items');
  });

  it('isolates text values in a right-to-left message, and chooses a select by the value itself', () => {
    const format = createLocalizedMessageFormatter();
    const message =
      '{isYou, select, true {أضف والديك} other {أضف والدًا لـ {name}}}';

    expect(format('ar', message, { isYou: 'false', name: 'Rob (B).' })).toBe(
      `أضف والدًا لـ ${FSI}Rob (B).${PDI}`,
    );
    expect(format('ar', message, { isYou: 'true', name: 'Rob (B).' })).toBe(
      'أضف والديك',
    );
  });

  it('leaves a left-to-right message with left-to-right values unchanged', () => {
    const format = createLocalizedMessageFormatter();
    expect(format('en', 'Add a parent for {name}', { name: 'Rob!' })).toBe(
      'Add a parent for Rob!',
    );
  });

  it('isolates a right-to-left value in a left-to-right message', () => {
    const format = createLocalizedMessageFormatter();
    expect(
      format('en', 'Add a parent for {name} ({count})', {
        name: 'أحمد',
        count: 2,
      }),
    ).toBe(`Add a parent for ${FSI}أحمد${PDI} (2)`);
  });
});
