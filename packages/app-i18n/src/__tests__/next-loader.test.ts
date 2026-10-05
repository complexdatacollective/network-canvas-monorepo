import { describe, expect, it } from 'vitest';

import type { CatalogMessages } from '../locales.ts';
import { createAppIntl } from '../messages.ts';
import nextLoader from '../next-loader.ts';

const run = (code: string, resourcePath: string) =>
  nextLoader.call({ resourcePath }, code);

describe('the Next message compiler', () => {
  it('compiles whole ICU source and preserves server/client directives', () => {
    const code = `"use client";
      import { defineMessages } from '@codaco/app-i18n/messages';
      export const messages = defineMessages({ count: {
        id: 'example.count', defaultMessage: '{count, plural, one {# item} other {# items}}',
        description: 'Number of items.'
      }});`;
    const compiled = run(code, '/app/src/Example.tsx');
    expect(compiled).toContain('"use client"');
    expect(compiled).toContain('"type":6');
    expect(compiled).not.toContain('{count, plural');
    expect(compiled).not.toContain('Number of items.');
  });

  it('compiles a Spanish catalog to executable ICU AST', async () => {
    const compiled = run(
      JSON.stringify({
        'example.count':
          '{count, plural, one {# elemento} other {# elementos}}',
      }),
      '/app/src/locales/es.json',
    );
    const module: { default: CatalogMessages } = await import(
      `data:text/javascript,${encodeURIComponent(compiled)}`
    );
    const intl = createAppIntl({ locale: 'es', messages: module.default });
    expect(
      intl.formatMessage(
        {
          id: 'example.count',
          defaultMessage: '{count, plural, one {# item} other {# items}}',
          description: 'Number of test items.',
        },
        { count: 1 },
      ),
    ).toBe('1 elemento');
    expect(
      intl.formatMessage(
        {
          id: 'example.count',
          defaultMessage: '{count, plural, one {# item} other {# items}}',
          description: 'Number of test items.',
        },
        { count: 2 },
      ),
    ).toBe('2 elementos');
    expect(compiled).not.toContain('{count, plural');
  });

  it('retains TSX for Next to compile and leaves non-message source alone', () => {
    const code =
      'export default function Example() { return <div>{123}</div>; }';
    expect(run(code, '/app/src/Example.tsx')).toBe(code);
  });

  it('leaves unrelated JSON values and English extraction data unchanged', async () => {
    const data = { defaultMessage: 'Hello {name}', description: 'Example' };
    const compiled = run(JSON.stringify(data), '/app/src/locales/en.json');
    const module: { default: unknown } = await import(
      `data:text/javascript,${encodeURIComponent(compiled)}`
    );
    expect(module.default).toEqual(data);
  });
});
