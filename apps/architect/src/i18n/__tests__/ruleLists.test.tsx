import { act, cleanup, render, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import PreviewText from '~/components/Query/Rules/PreviewText';
import { getRuleDisplayOptions } from '~/components/Query/Rules/withDisplayOptions';

import { ArchitectI18nProvider } from '../ArchitectI18nProvider';
import { ARCHITECT_LOCALE_KEY } from '../preference';

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

function selectLocale(locale: string) {
  act(() => {
    localStorage.setItem(ARCHITECT_LOCALE_KEY, locale);
    window.dispatchEvent(
      new StorageEvent('storage', { key: ARCHITECT_LOCALE_KEY }),
    );
  });
}

it.each(['default', 'summary'] as const)(
  'formats the whole %s operand list across languages while retaining duplicate labels, markup, and stored values',
  (variant) => {
    const rule = {
      type: 'node',
      options: {
        type: 'person',
        attribute: 'groups',
        operator: 'INCLUDES',
        value: ['first', 'second', 'third'],
      },
      codebook: {
        node: {
          person: {
            name: 'Authored_Person',
            variables: {
              groups: {
                name: 'Authored_Groups',
                type: 'categorical',
                options: [
                  { value: 'first', label: 'Bravo' },
                  { value: 'second', label: '**Bravo**' },
                  {
                    value: 'third',
                    label: '[Isabel](https://example.org/authored)',
                  },
                ],
              },
            },
          },
        },
      },
    };
    const original = structuredClone(rule);
    const { container } = render(
      <ArchitectI18nProvider>
        <PreviewText
          type={rule.type}
          options={getRuleDisplayOptions(rule)}
          variant={variant}
        />
      </ArchitectI18nProvider>,
    );
    const tokens = Array.from(
      container.querySelectorAll<HTMLElement>('[data-rule-part="value"]'),
    );
    expect(tokens).toHaveLength(3);
    const [first, second, third] = tokens;
    if (!first || !second || !third || !first.parentElement) {
      throw new Error('Expected three authored tokens in one operand list');
    }
    const operand = first.parentElement;
    for (const [locale, expected] of [
      ['en', 'Bravo, Bravo, and Isabel'],
      ['es', 'Bravo, Bravo e Isabel'],
      ['en-GB', 'Bravo, Bravo and Isabel'],
    ]) {
      if (!locale || !expected) throw new Error('Missing locale expectation');
      selectLocale(locale);
      expect(operand).toHaveTextContent(expected);
      const currentTokens = Array.from(
        container.querySelectorAll('[data-rule-part="value"]'),
      );
      expect(currentTokens).toHaveLength(tokens.length);
      currentTokens.forEach((token, index) => {
        expect(token).toBe(tokens[index]);
      });
      expect(second.querySelector('strong')).toHaveTextContent('Bravo');
      expect(
        within(third).getByRole('link', { name: 'Isabel' }),
      ).toHaveAttribute('href', 'https://example.org/authored');
      expect(rule).toEqual(original);
    }
  },
);

it('retains literal numeric option operands while formatting their surrounding list', () => {
  const values = [12345, 0];
  const { container } = render(
    <ArchitectI18nProvider>
      <PreviewText
        type="ego"
        options={{
          attribute: 'Authored_Groups',
          variableType: 'categorical',
          operator: 'INCLUDES',
          value: values,
        }}
      />
    </ArchitectI18nProvider>,
  );
  expect(container).toHaveTextContent('12345 and 0');
  selectLocale('es');
  expect(container).toHaveTextContent('12345 y 0');
  expect(
    Array.from(container.querySelectorAll('[data-rule-part="value"]')).map(
      (token) => token.textContent,
    ),
  ).toEqual(['12345', '0']);
  expect(values).toEqual([12345, 0]);
});

it.each([
  ['GFM strike', '~~Isabel~~', 'Isabel', 'e'],
  ['GFM single strike', '~Isabel~', 'Isabel', 'e'],
  ['raw emphasis', '<em>Isabel</em>', 'Isabel', 'e'],
  ['unwrapped HTML', '<span>Isabel</span>', 'Isabel', 'e'],
  ['sanitized script', '<script>Zulu</script>Isabel', 'Isabel', 'e'],
  ['numeric entity', '&#73;sabel', 'Isabel', 'e'],
  ['named entity', 'Isabel &amp; Irene', 'Isabel & Irene', 'e'],
  [
    'reference link',
    '[Isabel][person]\n\n[person]: https://example.org',
    'Isabel',
    'e',
  ],
  [
    'discarded image',
    '![unspoken](https://example.org/image.png)Isabel',
    'Isabel',
    'e',
  ],
  ['unwrapped code', '`Isabel`', 'Isabel', 'e'],
  ['emoji', ':heart: Isabel', '❤️ Isabel', 'y'],
  ['escaped syntax', '\\~\\~Isabel\\~\\~', '~~Isabel~~', 'y'],
])(
  'uses the displayed %s label for both rule-list variants without rewriting its source',
  (_kind, label, displayed, spanishConjunction) => {
    if (!label || !displayed || !spanishConjunction) {
      throw new Error('Expected a complete Markdown label case');
    }
    const values = ['Bravo', label];
    const original = [...values];
    const { container } = render(
      <ArchitectI18nProvider>
        {(['default', 'summary'] as const).map((variant) => (
          <PreviewText
            key={variant}
            type="ego"
            variant={variant}
            options={{
              attribute: 'Authored_Groups',
              variableType: 'categorical',
              operator: 'INCLUDES',
              value: values,
            }}
          />
        ))}
      </ArchitectI18nProvider>,
    );
    for (const locale of ['en', 'es', 'en-GB']) {
      selectLocale(locale);
      const tokens = Array.from(
        container.querySelectorAll('[data-rule-part="value"]'),
      );
      expect(tokens).toHaveLength(4);
      const conjunction = locale === 'es' ? spanishConjunction : 'and';
      for (const offset of [0, 2]) {
        const first = tokens[offset];
        const second = tokens[offset + 1];
        expect(second?.textContent).toBe(displayed);
        expect(first?.parentElement).toHaveTextContent(
          `Bravo ${conjunction} ${displayed}`,
        );
      }
      expect(values).toEqual(original);
    }
  },
);
