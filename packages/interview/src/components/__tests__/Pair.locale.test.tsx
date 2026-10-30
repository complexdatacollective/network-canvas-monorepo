import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { InterviewI18nProvider } from '../../i18n/InterviewI18nProvider';
import Pair from '../Pair';

// Isolate the pair's accessible name from decryption and graphical nodes;
// the names returned here are literal participant data, as in the live hook.
vi.mock('../../interfaces/Anonymisation/useNodeLabel', () => ({
  useNodeLabel: (node: NcNode | undefined) =>
    node?.[entityAttributesProperty].name,
}));
vi.mock('../ConnectedNode', () => ({ default: () => null }));

const person = (id: string, name?: string): NcNode => ({
  [entityPrimaryKeyProperty]: id,
  [entityAttributesProperty]: name === undefined ? {} : { name },
  type: 'person',
});

// The pair's name is read only by screen readers, and screen reader text
// stays in English whatever language the interview shows.
describe('pair accessibility language', () => {
  it('names the pair in English, keeping both literal names', () => {
    const first = person('a', 'Ana');
    const second = person('b', 'Irene <literal>');
    const before = structuredClone([first, second]);
    render(
      <InterviewI18nProvider>
        <section role="group" aria-labelledby="pair-name">
          <Pair
            fromNode={first}
            toNode={second}
            edgeColor="edge-color-seq-1"
            labelId="pair-name"
          />
        </section>
      </InterviewI18nProvider>,
    );
    expect(
      screen.getByRole('group', { name: 'Ana and Irene <literal>' }),
    ).toBeInTheDocument();
    expect([first, second]).toEqual(before);
  });

  it('names nodes without a name by their place in the pair', () => {
    render(
      <InterviewI18nProvider>
        <section role="group" aria-labelledby="pair-name">
          <Pair
            fromNode={person('a')}
            toNode={person('b')}
            edgeColor="edge-color-seq-1"
            labelId="pair-name"
          />
        </section>
      </InterviewI18nProvider>,
    );
    expect(
      screen.getByRole('group', { name: 'First item and second item' }),
    ).toBeInTheDocument();
  });
});
