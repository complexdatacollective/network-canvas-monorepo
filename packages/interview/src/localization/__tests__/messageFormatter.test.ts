import type * as IntlMessageFormatModule from 'intl-messageformat';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
});
