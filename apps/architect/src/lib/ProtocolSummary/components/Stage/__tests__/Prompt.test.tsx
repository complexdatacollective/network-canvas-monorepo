import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  testTypeId,
  testVariableId,
} from '@codaco/protocol-builder/testing/testId';
import type { CurrentProtocol } from '@codaco/protocol-validation';

import SummaryContext from '../../SummaryContext';
import Prompt from '../Prompt';

const renderPrompt = (sortOrder: unknown) =>
  render(<Prompt text={{ en: 'Who do you know?' }} sortOrder={sortOrder} />);

describe('Protocol Summary prompt sort order', () => {
  it('prints each sort rule of the prompt', () => {
    renderPrompt([
      { property: '*', direction: 'desc' },
      { property: 'name', direction: 'asc' },
    ]);

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it.each([
    ['text', 'name'],
    ['an object', { property: 'name', direction: 'asc' }],
    ['rules without a direction', [{ property: 'name' }]],
    ['rules without a property', [{ direction: 'asc' }]],
    ['rules that are not objects', ['name']],
  ])('prints no sort rules for %s', (_label, sortOrder) => {
    renderPrompt(sortOrder);

    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });
});

const PERSON = testTypeId('person');
const CLOSE = testVariableId('close');
const PLACE = testTypeId('place');
const VISITED = testVariableId('visited');

const protocol: CurrentProtocol = {
  schemaVersion: 9,
  name: 'Sociogram protocol',
  localization: { defaultLocale: 'en', locales: ['en'] },
  codebook: {
    node: {
      [PERSON]: {
        name: 'Person',
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables: { [CLOSE]: { name: 'close', type: 'boolean' } },
      },
      [PLACE]: {
        name: 'Place',
        color: 'node-color-seq-2',
        shape: { default: 'square' },
        variables: { [VISITED]: { name: 'visited', type: 'boolean' } },
      },
    },
  },
  assetManifest: {},
  stages: [],
};

const index = [
  { id: CLOSE, name: 'close', type: 'boolean', stages: [] },
  { id: VISITED, name: 'visited', type: 'boolean', stages: [] },
];

describe('Protocol Summary Sociogram task', () => {
  it('prints the task and each highlight entry', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SummaryContext.Provider
          value={{ protocol, protocolName: protocol.name, index }}
        >
          <Prompt
            text={{ en: 'Who are you close to?' }}
            task="highlight"
            highlight={[
              { id: 'h1', type: PERSON, variable: CLOSE },
              { id: 'h2', type: PLACE, variable: VISITED },
            ]}
          />
        </SummaryContext.Provider>
      </QueryClientProvider>,
    );

    const taskRow = screen.getByText('Task').closest('tr');
    expect(taskRow).toHaveTextContent('Highlight nodes');
    const highlightRows = screen
      .getAllByText('Highlight attribute')
      .map((label) => label.closest('tr'));
    expect(highlightRows).toHaveLength(2);
    expect(highlightRows[0]).toHaveTextContent('Person');
    expect(highlightRows[0]).toHaveTextContent('close');
    expect(highlightRows[0]).not.toHaveTextContent('visited');
    expect(highlightRows[1]).toHaveTextContent('Place');
    expect(highlightRows[1]).toHaveTextContent('visited');
    expect(highlightRows[1]).not.toHaveTextContent('close');
  });

  it.each([
    ['layout', 'Position nodes'],
    ['connect', 'Connect nodes'],
  ])('names the %s task', (task, label) => {
    render(<Prompt text={{ en: 'Who do you know?' }} task={task} />);

    expect(screen.getByText('Task').closest('tr')).toHaveTextContent(label);
    expect(screen.queryByText('Highlight attribute')).not.toBeInTheDocument();
  });
});
