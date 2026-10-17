import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import developmentProtocol from '@codaco/protocols/development';
import { actionCreators as protocolActions } from '~/ducks/modules/activeProtocol';
import { rootReducer } from '~/ducks/modules/root';
import { ProtocolReadOnlyContext } from '~/hooks/useProtocolReadOnly';

import Codebook from '../Codebook';
import EntityType from '../EntityType';

const UNUSED_NODE = 'unused_node_type';

const makeStore = () => {
  const protocol = structuredClone(
    developmentProtocol,
  ) as unknown as CurrentProtocol;
  protocol.codebook.node = {
    ...protocol.codebook.node,
    [UNUSED_NODE]: {
      name: 'Unused',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
    },
  };
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  store.dispatch(protocolActions.setActiveProtocol(protocol));
  return store;
};

const renderWithLock = (ui: React.ReactElement, readOnly: boolean | null) => {
  const store = makeStore();
  const tree = <Provider store={store}>{ui}</Provider>;
  return render(
    readOnly === null ? (
      tree
    ) : (
      <ProtocolReadOnlyContext value={readOnly}>{tree}</ProtocolReadOnlyContext>
    ),
  );
};

describe('Codebook while another tab owns the protocol', () => {
  it('disables every control that creates, edits or deletes', () => {
    const onEditEntity = vi.fn();
    renderWithLock(<Codebook onEditEntity={onEditEntity} />, true);

    const createNode = screen.getByRole('button', { name: 'Create node type' });
    const createEdge = screen.getByRole('button', { name: 'Create edge type' });
    expect(createNode).toBeDisabled();
    expect(createEdge).toBeDisabled();

    const editButtons = screen.getAllByRole('button', { name: 'Edit entity' });
    const deleteButtons = screen.getAllByRole('button', {
      name: 'Delete entity',
    });
    // The ego section plus every node and edge type each carry one.
    const addAttributeButtons = screen.getAllByRole('button', {
      name: 'Add attribute',
    });
    expect(editButtons.length).toBeGreaterThan(1);
    expect(deleteButtons.length).toBeGreaterThan(1);
    expect(addAttributeButtons.length).toBeGreaterThan(2);
    for (const button of [
      ...editButtons,
      ...deleteButtons,
      ...addAttributeButtons,
    ]) {
      expect(button).toBeDisabled();
    }

    for (const button of [createNode, createEdge, ...editButtons]) {
      fireEvent.click(button);
    }
    expect(onEditEntity).not.toHaveBeenCalled();
  });

  it('renders attribute names without a rename trigger and disables deletion', () => {
    renderWithLock(<Codebook />, true);

    expect(
      screen.queryByRole('button', { name: /^Edit attribute name:/ }),
    ).not.toBeInTheDocument();
    const deleteAttribute = screen.getAllByRole('button', {
      name: 'Delete attribute',
    });
    expect(deleteAttribute.length).toBeGreaterThan(0);
    for (const button of deleteAttribute) {
      expect(button).toBeDisabled();
    }
  });

  it('keeps search and the unused filter usable', () => {
    renderWithLock(<Codebook />, true);

    const search = screen.getByRole('searchbox', {
      name: 'Search the codebook by name',
    });
    expect(search).toBeEnabled();

    const unusedOnly = screen.getByRole('checkbox', {
      name: 'Show unused only',
    });
    expect(unusedOnly).not.toHaveAttribute('aria-disabled', 'true');
    expect(unusedOnly).not.toBeDisabled();
    fireEvent.click(unusedOnly);
    expect(unusedOnly).toBeChecked();
  });

  it('keeps an unused type deletable only outside read-only', () => {
    const { unmount } = renderWithLock(
      <EntityType entity="node" type={UNUSED_NODE} inUse={false} usage={[]} />,
      true,
    );
    expect(
      screen.getByRole('button', { name: 'Delete entity' }),
    ).toBeDisabled();
    unmount();

    renderWithLock(
      <EntityType entity="node" type={UNUSED_NODE} inUse={false} usage={[]} />,
      false,
    );
    expect(screen.getByRole('button', { name: 'Delete entity' })).toBeEnabled();
  });
});

describe.each([
  ['outside the route guard', null],
  ['while the protocol is editable', false],
])('Codebook %s', (_label, readOnly) => {
  it('leaves the editing controls enabled', () => {
    renderWithLock(<Codebook onEditEntity={vi.fn()} />, readOnly);

    expect(
      screen.getByRole('button', { name: 'Create node type' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Create edge type' }),
    ).toBeEnabled();
    for (const button of [
      ...screen.getAllByRole('button', { name: 'Edit entity' }),
      ...screen.getAllByRole('button', { name: 'Add attribute' }),
    ]) {
      expect(button).toBeEnabled();
    }
    expect(
      screen.getAllByRole('button', { name: /^Edit attribute name:/ }).length,
    ).toBeGreaterThan(0);
  });
});
