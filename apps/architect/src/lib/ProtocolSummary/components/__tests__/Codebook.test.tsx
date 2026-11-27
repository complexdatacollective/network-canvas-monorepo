import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { developmentProtocol } from '~/templates/development-protocol';

import Codebook from '../Codebook';
import Contents from '../Contents';
import SummaryContext from '../SummaryContext';

const layoutId = (name: string) => {
  const entry = Object.entries(developmentProtocol.codebook.layouts ?? {}).find(
    ([, layout]) => layout.name === name,
  );
  if (!entry) throw new Error(`The protocol has no layout "${name}".`);
  return entry[0];
};

const renderSummary = (children: React.ReactNode) =>
  render(
    <SummaryContext.Provider
      value={{
        protocol: developmentProtocol,
        protocolName: developmentProtocol.name ?? '',
        index: [],
      }}
    >
      <QueryClientProvider client={new QueryClient()}>
        {children}
      </QueryClientProvider>
    </SummaryContext.Provider>,
  );

/** The cell after the row label `label` in the table of `entry`. */
const rowValue = (entry: HTMLElement, label: string) => {
  const cell = within(entry).getByText(label).closest('td')?.nextElementSibling;
  if (!(cell instanceof HTMLElement)) throw new Error(`No row for ${label}.`);
  return cell;
};

describe('the layouts in the printable codebook', () => {
  it('prints each layout with the stages and node types that use it', () => {
    const { container } = renderSummary(<Codebook />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Layouts' }),
    ).toBeInTheDocument();
    const closeness = container.querySelector(
      `#layout-${layoutId('closenessLayout')}`,
    );
    if (!(closeness instanceof HTMLElement)) {
      throw new Error('closenessLayout is not printed.');
    }
    expect(rowValue(closeness, 'Placed on')).toHaveTextContent(
      'SociogramNetwork Composer',
    );
    expect(rowValue(closeness, 'Shown on')).toHaveTextContent('Narrative');
    expect(rowValue(closeness, 'Node types')).toHaveTextContent('person');

    const unused = container.querySelector(
      `#layout-${layoutId('manualLayout')}`,
    );
    if (!(unused instanceof HTMLElement)) {
      throw new Error('manualLayout is not printed.');
    }
    expect(unused).toHaveTextContent('Not in use');
  });

  it('links to each layout from the contents', () => {
    renderSummary(<Contents />);

    expect(
      screen.getByRole('link', { name: 'closenessLayout' }),
    ).toHaveAttribute('href', `#layout-${layoutId('closenessLayout')}`);
  });
});
