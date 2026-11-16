import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { defineAppLocales } from '@codaco/app-i18n/locales';
import { AppI18nProvider } from '@codaco/app-i18n/react';

import {
  TokenizedText,
  TokenPill,
  tokenPillClasses,
  tokenPillLanguage,
} from '../TokenPill';

const locales = defineAppLocales([
  { locale: 'en', label: 'English', direction: 'ltr' },
  { locale: 'ar', label: 'العربية', direction: 'rtl' },
]);

/** A pill in the Arabic interface, inside a protocol's English text. */
const inArabicInterface = (children: ReactNode) =>
  render(
    <AppI18nProvider locale="ar" locales={locales}>
      <p lang="en" dir="ltr">
        {children}
      </p>
    </AppI18nProvider>,
  );

const pillOf = (container: HTMLElement) =>
  container.querySelector('[data-token]');

describe('TokenPill', () => {
  it('says its label, and records the token it stands for', () => {
    const { container } = render(<TokenPill token="name" label="Name" />);

    const pill = pillOf(container);
    expect(pill).toHaveAttribute('data-token', 'name');
    expect(pill).not.toHaveAttribute('data-selected');
  });

  it('is drawn with the classes the editor draws its pills with', () => {
    const { container } = render(<TokenPill token="name" label="Name" />);

    expect(pillOf(container)?.className).toBe(tokenPillClasses());
  });

  it('sets the value’s name in bold body type, whatever surrounds it', () => {
    // A field label is bold in the heading face; a pill in it reads as the
    // editor's pill does, not as the label's own weight and face.
    const { container } = render(
      <span className="font-heading font-bold">
        Hello <TokenPill token="name" label="Name" />
      </span>,
    );

    expect(pillOf(container)).toHaveClass('font-body', 'font-bold');
  });

  it('opens with the value icon, hidden from screen readers', () => {
    const { container } = render(<TokenPill token="name" label="Name" />);

    const icon = container.querySelector('svg');
    expect(icon).toHaveClass('lucide-syringe');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps its icon on the line its label starts on, and lets the rest of the label wrap', () => {
    const { container } = render(
      <TokenPill token="partner" label="partner of (x) Name" />,
    );

    const pill = container.querySelector('[data-token="partner"]');
    expect(pill).toHaveTextContent('partner of (x) Name');
    const lead = pill?.firstElementChild;
    expect(lead).toHaveClass('whitespace-nowrap');
    expect(lead?.firstElementChild).toBe(pill?.querySelector('svg'));
    // The icon and the first word only: the label wraps after it.
    expect(lead?.textContent).toBe('partner');
    expect(pill?.lastChild?.textContent).toBe(' of (x) Name');
  });

  it('marks itself as selected', () => {
    const { container } = render(
      <TokenPill token="name" label="Name" selected />,
    );

    expect(pillOf(container)).toHaveAttribute('data-selected', 'true');
  });
});

describe('TokenizedText', () => {
  const tokens = [
    { id: 'name', label: 'Name' },
    { id: '#', label: 'Number' },
  ];

  it('shows each placeholder as a pill among the words, read through as one sentence', () => {
    render(
      <p data-testid="line">
        <TokenizedText
          parts={['Add ', { token: 'name' }, '’s ', { token: '#' }, ' parents']}
          tokens={tokens}
        />
      </p>,
    );

    const line = screen.getByTestId('line');
    expect(line).toHaveTextContent('Add Name’s Number parents');
    expect(
      [...line.querySelectorAll('[data-token]')].map((pill) => [
        pill.getAttribute('data-token'),
        pill.textContent,
      ]),
    ).toEqual([
      ['name', 'Name'],
      ['#', 'Number'],
    ]);
  });

  it('shows a placeholder it has no label for as the name it was recorded under', () => {
    const { container } = render(
      <TokenizedText parts={[{ token: 'relation' }]} tokens={tokens} />,
    );

    const pill = pillOf(container);
    expect(pill).toHaveAttribute('data-token', 'relation');
    expect(pill).toHaveTextContent('relation');
  });
});

describe('a pill’s language', () => {
  const arabic = { lang: 'ar', dir: 'rtl' } as const;

  it('gives the interface’s words the interface’s language and direction', () => {
    expect(tokenPillLanguage('اليوم', arabic)).toEqual(arabic);

    const { container } = inArabicInterface(
      <TokenPill token="today" label="اليوم" />,
    );
    const pill = pillOf(container);
    expect(pill).toHaveAttribute('lang', 'ar');
    expect(pill).toHaveAttribute('dir', 'rtl');
  });

  it('lets a name someone wrote read in its own direction, in the text’s language', () => {
    // An English attribute called “team-b!” in the Arabic interface keeps its
    // “!” at its end, and a screen reader does not read it as Arabic.
    const name = { text: 'team-b!', dir: 'auto' } as const;
    expect(tokenPillLanguage(name, arabic)).toEqual({ dir: 'auto' });

    const { container } = inArabicInterface(
      <TokenPill token="team" label={name} />,
    );
    const pill = pillOf(container);
    expect(pill).toHaveAttribute('dir', 'auto');
    expect(pill).not.toHaveAttribute('lang');
    expect(pill).toHaveTextContent('team-b!');
  });

  it('shows a placeholder it was not told about by its recorded name, in its own direction', () => {
    const { container } = inArabicInterface(
      <TokenizedText parts={[{ token: 'team_b' }]} tokens={[]} />,
    );
    const pill = pillOf(container);
    expect(pill).toHaveTextContent('team_b');
    expect(pill).toHaveAttribute('dir', 'auto');
    expect(pill).not.toHaveAttribute('lang');
  });
});
