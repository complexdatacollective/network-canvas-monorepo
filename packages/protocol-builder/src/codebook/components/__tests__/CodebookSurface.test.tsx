import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ProtocolBuilderProtocolContext } from '../../../protocol-context.ts';
import { testTypeId, testVariableId } from '../../../testing/testId.ts';
import CodebookSurface from '../CodebookSurface.tsx';

const PERSON = testTypeId('person');
const KNOWS = testTypeId('knows');
const AGE = testVariableId('age');
const CLOSENESS = testVariableId('closeness');
const CONSENT = testVariableId('consent');

const context: ProtocolBuilderProtocolContext = {
  codebook: {
    node: {
      [PERSON]: {
        name: 'Person',
        color: 'node-color-seq-1',
        icon: 'add-a-person',
        shape: { default: 'circle' },
        variables: {
          [AGE]: {
            name: 'Age',
            type: 'number',
            component: 'Number',
          },
        },
      },
    },
    edge: {
      [KNOWS]: {
        name: 'Knows',
        color: 'edge-color-seq-1',
        variables: {
          [CLOSENESS]: {
            name: 'Closeness',
            type: 'number',
          },
        },
      },
    },
    ego: {
      variables: {
        [CONSENT]: { name: 'Consent', type: 'boolean' },
      },
    },
  },
  assets: {},
  orderedStages: [],
  issues: [
    {
      sectionId: 'codebook:node:missing',
      path: ['shape'],
      message: 'Required entity appearance is missing.',
    },
  ],
};

describe('CodebookSurface', () => {
  it('lists existing node, edge, and ego entities and reports omitted context', () => {
    render(<CodebookSurface context={context} />);

    expect(
      screen.getByRole('article', { name: 'Node type: Person' }),
    ).toBeVisible();
    expect(
      screen.getByRole('article', { name: 'Edge type: Knows' }),
    ).toBeVisible();
    expect(
      screen.getByRole('article', { name: 'Ego attributes' }),
    ).toBeVisible();
    expect(
      screen.getByRole('list', { name: 'Person attributes' }),
    ).toHaveTextContent('Age');
    expect(
      screen.getByRole('list', { name: 'Knows attributes' }),
    ).toHaveTextContent('Closeness');
    expect(
      screen.getByRole('list', { name: 'Ego attributes' }),
    ).toHaveTextContent('Consent');
    expect(
      screen.getByRole('list', { name: 'Codebook issues' }),
    ).toHaveTextContent(
      'codebook:node:missing: Required entity appearance is missing.',
    );
  });

  it('exposes entity and variable actions with complete accessible names', async () => {
    const user = userEvent.setup();
    const onCreateEntity = vi.fn();
    const onEditEntity = vi.fn();
    const onCreateVariable = vi.fn();
    const onEditVariable = vi.fn();
    render(
      <CodebookSurface
        context={context}
        onCreateEntity={onCreateEntity}
        onEditEntity={onEditEntity}
        onCreateVariable={onCreateVariable}
        onEditVariable={onEditVariable}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Create node type' }));
    expect(onCreateEntity).toHaveBeenCalledWith('node');

    await user.click(
      screen.getByRole('button', { name: 'Edit Node type: Person' }),
    );
    expect(onEditEntity).toHaveBeenCalledWith({
      entity: 'node',
      type: PERSON,
    });

    await user.click(
      screen.getByRole('button', { name: 'Edit Ego attributes' }),
    );
    expect(onEditEntity).toHaveBeenCalledWith({ entity: 'ego' });

    await user.click(
      screen.getByRole('button', {
        name: 'Create attribute for Edge type: Knows',
      }),
    );
    expect(onCreateVariable).toHaveBeenCalledWith({
      entity: 'edge',
      type: KNOWS,
    });

    await user.click(
      screen.getByRole('button', {
        name: 'Edit attribute Consent for Ego attributes',
      }),
    );
    expect(onEditVariable).toHaveBeenCalledWith({ entity: 'ego' }, CONSENT);
  });

  it('offers creation for a missing ego section and names empty groups explicitly', async () => {
    const user = userEvent.setup();
    const onCreateEntity = vi.fn();
    render(
      <CodebookSurface
        context={{
          codebook: { node: {}, edge: {} },
          assets: {},
          orderedStages: [],
          issues: [],
        }}
        onCreateEntity={onCreateEntity}
      />,
    );

    expect(
      screen.getByText('No valid node types are available.'),
    ).toBeVisible();
    expect(
      screen.getByText('No valid edge types are available.'),
    ).toBeVisible();
    expect(
      screen.getByText('No valid ego definition is available.'),
    ).toBeVisible();

    await user.click(
      screen.getByRole('button', { name: 'Add ego attributes' }),
    );
    expect(onCreateEntity).toHaveBeenCalledWith('ego');
  });
});
