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

describe('pair accessibility language', () => {
  it('uses locale-aware conjunctions while preserving both literal names on a live change', () => {
    const first = person('a', 'Ana');
    const second = person('b', 'Irene <literal>');
    const before = structuredClone([first, second]);
    const pair = (
      <section role="group" aria-labelledby="pair-name">
        <Pair
          fromNode={first}
          toNode={second}
          edgeColor="edge-color-seq-1"
          labelId="pair-name"
        />
      </section>
    );
    const view = render(
      <InterviewI18nProvider requestedLocale="en">
        {pair}
      </InterviewI18nProvider>,
    );
    const group = screen.getByRole('group', {
      name: 'Ana and Irene <literal>',
    });
    view.rerender(
      <InterviewI18nProvider requestedLocale="es-MX">
        {pair}
      </InterviewI18nProvider>,
    );
    expect(screen.getByRole('group', { name: 'Ana e Irene <literal>' })).toBe(
      group,
    );
    expect([first, second]).toEqual(before);
  });

  it('translates only missing-name fallbacks', () => {
    render(
      <InterviewI18nProvider requestedLocale="es">
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
      screen.getByRole('group', { name: 'Primer elemento y segundo elemento' }),
    ).toBeInTheDocument();
  });
});
