import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import developmentProtocol from '@codaco/protocols/development';
import { hasOpenNestedEditor } from '~/components/DialogForm/nestedDraftRegistry';
import { actionCreators as protocolActions } from '~/ducks/modules/activeProtocol';
import { setActiveProtocolId } from '~/ducks/modules/app';
import { rootReducer } from '~/ducks/modules/root';
import { getCodebook } from '~/selectors/protocol';

import Codebook from '../Codebook';
import type { CodebookLink } from '../codebookLinks';

const renderCodebook = (
  props: { link?: CodebookLink; onLinkClosed?: () => void } = {},
) => {
  const protocol = structuredClone(
    developmentProtocol,
  ) as unknown as CurrentProtocol;
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  store.dispatch(protocolActions.setActiveProtocol(protocol));
  store.dispatch(setActiveProtocolId('protocol-1'));
  render(
    <Provider store={store}>
      <QueryClientProvider client={new QueryClient()}>
        <Codebook {...props} />
      </QueryClientProvider>
    </Provider>,
  );
  return { store, user: userEvent.setup() };
};

const typeNames = (
  store: ReturnType<typeof renderCodebook>['store'],
  entity: 'node' | 'edge',
) =>
  Object.values(getCodebook(store.getState())?.[entity] ?? {}).map(
    (type) => type.name,
  );

describe('the codebook’s editors', () => {
  it.each([
    ['node', 'Create node type', 'Create new node type', 'Node type name'],
    ['edge', 'Create edge type', 'Create new edge type', 'Edge type name'],
  ] as const)(
    'creates a %s type in the shared editor',
    async (entity, trigger, title, nameLabel) => {
      const { store, user } = renderCodebook();

      await user.click(screen.getByRole('button', { name: trigger }));
      const dialog = await screen.findByRole('dialog', { name: title });
      await user.type(
        within(dialog).getByRole('textbox', { name: nameLabel }),
        'Workplace',
      );
      await user.click(
        within(dialog).getByRole('button', { name: 'Save entity' }),
      );

      await waitFor(() =>
        expect(typeNames(store, entity)).toContain('Workplace'),
      );
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
    },
  );

  it('asks before discarding a changed type, and counts as an open editor meanwhile', async () => {
    const { store, user } = renderCodebook();
    const before = typeNames(store, 'node');

    await user.click(screen.getByRole('button', { name: 'Create node type' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Create new node type',
    });
    expect(hasOpenNestedEditor()).toBe(true);
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Node type name' }),
      'Abandoned',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    // Architect's test setup answers every confirm with a yes.
    expect(globalThis.__architectDialogMocks.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Discard your changes?',
        confirmLabel: 'Discard changes',
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(typeNames(store, 'node')).toEqual(before);
    await waitFor(() => expect(hasOpenNestedEditor()).toBe(false));
  });

  it('opens the linked type for editing and reports when it closes', async () => {
    const onLinkClosed = vi.fn();
    const { user } = renderCodebook({
      link: { entity: 'node', type: 'person_node_type' },
      onLinkClosed,
    });

    const dialog = await screen.findByRole('dialog', {
      name: 'Edit this node type',
    });
    expect(
      within(dialog).getByRole('textbox', { name: 'Node type name' }),
    ).not.toHaveValue('');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(onLinkClosed).toHaveBeenCalledTimes(1));
  });

  it('opens nothing for a link to a type that does not exist', () => {
    renderCodebook({ link: { entity: 'node', type: 'missing' } });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('creates an attribute for the ego in the shared attribute editor', async () => {
    const { store, user } = renderCodebook();

    const [addEgoAttribute] = screen.getAllByRole('button', {
      name: 'Add attribute',
    });
    if (addEgoAttribute === undefined) throw new Error('no Add attribute');
    await user.click(addEgoAttribute);
    const dialog = await screen.findByRole('dialog', {
      name: 'Create attribute',
    });
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Attribute name' }),
      'shoe_size',
    );
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Attribute type' }),
      'Number',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Create attribute' }),
    );

    await waitFor(() =>
      expect(
        Object.values(getCodebook(store.getState())?.ego?.variables ?? {}).map(
          (variable) => variable.name,
        ),
      ).toContain('shoe_size'),
    );
  });
});
