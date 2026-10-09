import type * as IntlMessageFormatModule from 'intl-messageformat';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { suppliedStageText } from '@codaco/protocol-validation';

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

  // A Japanese protocol holds the English minimum notice Network Canvas
  // supplies, having no Japanese wording for it. By Japanese plural rules
  // every count is "other", which would read "1 items".
  it('chooses the plural of Network Canvas’s English wording by English rules, whatever language holds it', () => {
    const format = createLocalizedMessageFormatter();
    const [notice] = suppliedStageText('NameGenerator', {
      defaultLocale: 'ja',
      locales: ['ja'],
    }).filter(({ path }) => path[0] === 'minNodesNotice');
    const english = notice?.value.ja;
    if (english === undefined) throw new Error('No minimum notice');

    expect(format('ja', english, { count: 1 })).toBe(
      'You must create at least 1 item before you can continue.',
    );
    expect(format('ja', english, { count: 2 })).toBe(
      'You must create at least 2 items before you can continue.',
    );
  });

  it('chooses the plural of a researcher’s message by the rules of the language holding it', () => {
    const format = createLocalizedMessageFormatter();
    expect(
      format('ja', '{count, plural, one {# item} other {# items}}', {
        count: 1,
      }),
    ).toBe('1 items');
  });
});
