import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { InterviewI18nProvider } from '../../i18n/InterviewI18nProvider';
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

describe('roster built-in value localization', () => {
  it('switches boolean display text without translating authored names, questions, or stored data', () => {
    const original = structuredClone(details);
    const { rerender } = render(<Example locale="en" />);
    const card = screen.getByRole('article', { name: 'Researcher label' });
    expect(within(card).getByText('Yes, No')).toBeInTheDocument();

    rerender(<Example locale="es-MX" />);
    expect(screen.getByRole('article', { name: 'Researcher label' })).toBe(
      card,
    );
    expect(within(card).getByText('Sí, No')).toBeInTheDocument();
    expect(within(card).getByText('Authored question')).toBeInTheDocument();
    expect(within(card).getByText('Zoë Álvarez')).toBeInTheDocument();
    expect(within(card).getByText('7')).toBeInTheDocument();
    expect(details).toEqual(original);
  });

  it('keeps English defaults when rendered without any localization provider', () => {
    render(<Example />);
    expect(screen.getByText('Yes, No')).toBeInTheDocument();
  });

  it('marks a detail label shown in another language with that language and direction', () => {
    render(
      <DataCard
        label="Researcher label"
        details={[
          {
            id: 'age',
            label: { text: 'العمر', lang: 'ar', dir: 'rtl' },
            value: 34,
          },
          { id: 'city', label: 'City', value: 'Lyon' },
        ]}
      />,
    );

    const translated = screen.getByText('العمر');
    expect(translated).toHaveAttribute('lang', 'ar');
    expect(translated).toHaveAttribute('dir', 'rtl');
    expect(screen.getByText('City')).not.toHaveAttribute('lang');
  });
});
