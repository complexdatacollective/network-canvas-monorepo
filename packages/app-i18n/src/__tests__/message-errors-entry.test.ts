import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  createMessageError,
  defineMessages,
  formatMessageError,
} from '../message-errors.ts';
import { createAppIntl } from '../messages.ts';

const srcDir = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * The specifiers a module loads at run time: every `import`/`export … from`
 * that is not type-only.
 */
function runtimeSpecifiers(file: string): string[] {
  const source = readFileSync(join(srcDir, file), 'utf8');
  return [
    ...source.matchAll(
      /^(?:import|export)\s+(?!type\b)[^;]*?from\s+'([^']+)'/gms,
    ),
  ].map((match) => match[1] ?? '');
}

describe('@codaco/app-i18n/message-errors', () => {
  // A server bundles this entry to refuse with messages a client formats. If
  // it reached react-intl at run time, the server would take React with it.
  it('loads nothing outside the package at run time', () => {
    const seen = new Set<string>();
    const pending = ['message-errors.ts'];
    while (pending.length > 0) {
      const file = pending.pop() ?? '';
      if (seen.has(file)) continue;
      seen.add(file);
      for (const specifier of runtimeSpecifiers(file)) {
        expect(specifier, `${file} loads ${specifier}`).toMatch(/^\.\//);
        pending.push(specifier.slice(2));
      }
    }
    expect([...seen].toSorted()).toEqual([
      'message-errors.ts',
      'messageErrors.ts',
    ]);
  });

  it('declares messages that a client formats in the reader’s language', () => {
    const messages = defineMessages({
      missing: {
        id: 'demo.missing',
        defaultMessage: 'Nothing is stored for {name}.',
        description: 'Test refusal.',
      },
    });
    const encoded = createMessageError(messages.missing, { name: 'a.png' });

    const english = createAppIntl({ locale: 'en' });
    const other = createAppIntl({
      locale: 'en-GB',
      messages: { 'demo.missing': 'Nichts für {name}.' },
    });
    expect(formatMessageError(encoded, english)).toBe(
      'Nothing is stored for a.png.',
    );
    expect(formatMessageError(encoded, other)).toBe('Nichts für a.png.');
  });
});
