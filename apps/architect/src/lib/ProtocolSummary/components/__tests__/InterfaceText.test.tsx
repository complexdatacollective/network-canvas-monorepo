import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import Contents from '../Contents';
import InterfaceText from '../InterfaceText';
import SummaryContext from '../SummaryContext';

const protocolWith = (interfaceText: unknown) =>
  ({
    schemaVersion: 9,
    name: 'Wording protocol',
    localization: { defaultLocale: 'en', locales: ['en'] },
    codebook: { node: {}, edge: {}, ego: {} },
    assetManifest: {},
    stages: [],
    interfaceText,
  }) as unknown as CurrentProtocol;

const renderWith = (protocol: CurrentProtocol, children: React.ReactNode) =>
  render(
    <SummaryContext.Provider
      value={{ protocol, protocolName: protocol.name, index: [] } as never}
    >
      {children}
    </SummaryContext.Provider>,
  );

const withText = protocolWith({
  // Stored out of the wording's own order, which the summary restores.
  validation: {
    maxLength: {
      en: '{max, plural, one {Enter at most # character.} other {Enter at most # characters.}}',
    },
  },
  interview: { continue: { en: 'Carry on' } },
});

/** The table row whose label is `label`, so its value can be checked. */
const rowFor = (label: string) => {
  const row = screen.getByText(label).closest('tr');
  if (!(row instanceof HTMLElement)) throw new Error(`No row for ${label}`);
  return row;
};

describe('Protocol Summary interview text', () => {
  it('lists each group and entry by the names the translation table gives them', () => {
    renderWith(withText, <InterfaceText />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Interview text' }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Throughout the interview',
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Answer checks' }),
    ).toBeVisible();
    expect(screen.getByText('Continue button')).toBeVisible();
    expect(screen.getByText('Too long message')).toBeVisible();
    // The wording's order: the interview group before the validation group.
    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual(['Throughout the interview', 'Answer checks']);
  });

  it('prints a plain entry as it is written', () => {
    renderWith(withText, <InterfaceText />);

    expect(rowFor('Continue button')).toHaveTextContent('Carry on');
  });

  it('prints a message with arguments as its versions, not the syntax it is stored in', () => {
    renderWith(withText, <InterfaceText />);

    const row = rowFor('Too long message');
    expect(row).not.toHaveTextContent('{max, plural');
    expect(row).toHaveTextContent('Enter at most');
    expect(within(row).getAllByText(/character/).length).toBeGreaterThan(1);
  });

  it('prints nothing for a protocol that holds no interview text', () => {
    const { container } = renderWith(
      protocolWith(undefined),
      <InterfaceText />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('is linked from the contents only when it is printed', () => {
    const { unmount } = renderWith(withText, <Contents />);
    expect(
      screen.getByRole('link', { name: 'Interview text' }),
    ).toHaveAttribute('href', '#interface-text');
    unmount();

    renderWith(protocolWith(undefined), <Contents />);
    expect(screen.queryByRole('link', { name: 'Interview text' })).toBeNull();
  });
});
