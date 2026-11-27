import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { testId } from '@codaco/protocol-builder/testing/testId';
import {
  asEntityAttributeReference,
  type CurrentProtocol,
} from '@codaco/protocol-validation';
import { templateTypeId } from '~/templates/__tests__/templateCodebookIds';
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

const PERSON = templateTypeId(developmentProtocol, 'node', 'person');
const VENUE = templateTypeId(developmentProtocol, 'node', 'venue');

const renderSummary = (
  children: React.ReactNode,
  protocol: CurrentProtocol = developmentProtocol,
) =>
  render(
    <SummaryContext.Provider
      value={{
        protocol,
        protocolName: protocol.name ?? '',
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

  it('lists the layouts of a node type on its page', () => {
    const { container } = renderSummary(<Codebook />);

    const person = container.querySelector(`#entity-${PERSON}`);
    if (!(person instanceof HTMLElement)) {
      throw new Error('The person node type is not printed.');
    }
    const layouts = rowValue(person, 'Layouts');
    expect(layouts).toHaveTextContent('closenessLayout');
    expect(
      within(layouts).getByRole('link', { name: 'closenessLayout' }),
    ).toHaveAttribute('href', `#layout-${layoutId('closenessLayout')}`);
  });

  it('prints no layouts row for a node type that no stage places', () => {
    const protocol = structuredClone(developmentProtocol);
    protocol.stages = protocol.stages.filter(
      (stage) =>
        !(stage.type === 'Sociogram' || stage.type === 'NetworkComposer') ||
        !stage.subject.types.includes(VENUE),
    );
    const { container } = renderSummary(<Codebook />, protocol);

    const venue = container.querySelector(`#entity-${VENUE}`);
    if (!(venue instanceof HTMLElement)) {
      throw new Error('The venue node type is not printed.');
    }
    expect(within(venue).queryByText('Layouts')).not.toBeInTheDocument();
  });

  it('prints the stages whose rules name a layout', () => {
    const protocol = structuredClone(developmentProtocol);
    const sociogram = protocol.stages.find(
      (stage) => stage.type === 'Sociogram',
    );
    if (sociogram?.type !== 'Sociogram') {
      throw new Error('The protocol has no Sociogram.');
    }
    sociogram.filter = {
      join: 'OR',
      rules: [
        {
          type: 'node',
          id: testId('placed-rule'),
          options: {
            type: PERSON,
            attribute: asEntityAttributeReference(layoutId('manualLayout')),
            operator: 'EXISTS',
          },
        },
      ],
    };
    const { container } = renderSummary(<Codebook />, protocol);

    const named = container.querySelector(
      `#layout-${layoutId('manualLayout')}`,
    );
    if (!(named instanceof HTMLElement)) {
      throw new Error('manualLayout is not printed.');
    }
    const row = rowValue(named, 'Named in rules on');
    expect(
      within(row).getByRole('link', { name: 'Sociogram' }),
    ).toHaveAttribute('href', `#stage-${sociogram.id}`);
    expect(named).not.toHaveTextContent('Not in use');
  });
});
