import { render, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';

import { interviewCatalogSource } from '../../i18n/catalog';
import { InterviewI18nProvider } from '../../i18n/InterviewI18nProvider';
import { TestProtocolLocalization } from '../__tests__/TestProtocolLocalization';
import DataCard, { type DataCardDetail } from './DataCard';

const details: DataCardDetail[] = [
  { id: 'question', label: 'Authored question', value: [true, false] },
  { id: 'name', label: 'Authored name', value: 'Zoë Álvarez' },
  { id: 'number', label: 'Authored number', value: 7 },
];

function Example({ locale }: { locale?: string }) {
  const card = <DataCard label="Researcher label" details={details} />;
  return locale ? (
    <InterviewI18nProvider requestedLocale={locale}>
      {card}
    </InterviewI18nProvider>
  ) : (
    card
  );
}

// Loaded before anything renders, as a host loads a language before it
// mounts an interview, so renders in these languages are synchronous.
beforeAll(async () => {
  await Promise.all(
    ['es', 'de', 'fr'].map((locale) => interviewCatalogSource.load(locale)),
  );
});

describe('roster built-in value localization', () => {
  it('switches boolean display text without translating authored names, questions, or stored data', () => {
    const original = structuredClone(details);
    const { rerender } = render(<Example locale="en" />);
    const card = screen.getByRole('article', { name: 'Researcher label' });
    expect(within(card).getByText('Yes and No')).toBeInTheDocument();

    rerender(<Example locale="es-MX" />);
    expect(screen.getByRole('article', { name: 'Researcher label' })).toBe(
      card,
    );
    expect(within(card).getByText('Sí y No')).toBeInTheDocument();
    expect(within(card).getByText('Authored question')).toBeInTheDocument();
    expect(within(card).getByText('Zoë Álvarez')).toBeInTheDocument();
    expect(within(card).getByText('7')).toBeInTheDocument();
    expect(details).toEqual(original);
  });

  it('keeps English defaults when rendered without any localization provider', () => {
    render(<Example />);
    expect(screen.getByText('Yes and No')).toBeInTheDocument();
  });
});

describe('roster values follow the language the protocol is read in', () => {
  const values: DataCardDetail[] = [
    { id: 'number', label: 'Number', value: 1234.5 },
    { id: 'list', label: 'List', value: ['a', 'b', 'c'] },
    { id: 'place', label: 'Place', value: { x: -72.92794321, y: 41.3083 } },
    { id: 'empty', label: 'Empty', value: '' },
    { id: 'none', label: 'None', value: [] },
  ];

  const text = (label: string) =>
    screen.getByText(label).nextElementSibling?.textContent;

  it('formats numbers, lists and coordinates for the protocol language, not the interface language', () => {
    render(
      <InterviewI18nProvider requestedLocale="en">
        <TestProtocolLocalization
          localization={{ defaultLocale: 'de', locales: ['de'] }}
        >
          <DataCard label="Card" details={values} />
        </TestProtocolLocalization>
      </InterviewI18nProvider>,
    );

    expect(text('Number')).toBe('1.234,5');
    expect(text('List')).toBe('a, b und c');
    expect(text('Place')).toBe('41,3083 und -72,9279');
    // The words stay in the interface language.
    // A dash shows the empty value; its words are read by screen readers only.
    expect(text('Empty')).toBe('—No value');
    expect(text('None')).toBe('—No value');
  });

  it('formats for the interface language outside a protocol provider', () => {
    render(
      <InterviewI18nProvider requestedLocale="de">
        <DataCard label="Card" details={values} />
      </InterviewI18nProvider>,
    );

    expect(text('Number')).toBe('1.234,5');
    expect(text('List')).toBe('a, b und c');
    expect(text('Empty')).toBe('—Kein Wert');
  });

  it('writes the empty value in the interface language of each catalog', () => {
    render(
      <InterviewI18nProvider requestedLocale="fr">
        <DataCard label="Card" details={[values[3]!]} />
      </InterviewI18nProvider>,
    );

    expect(text('Empty')).toBe('—Aucune valeur');
  });
});
