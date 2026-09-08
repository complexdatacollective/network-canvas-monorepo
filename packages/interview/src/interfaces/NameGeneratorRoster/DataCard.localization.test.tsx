import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { InterviewI18nProvider } from '../../i18n/InterviewI18nProvider';
import DataCard from './DataCard';

const details = {
  'Authored question': [true, false],
  'Authored name': 'Zoë Álvarez',
  'Authored number': 7,
};

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
});
