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
