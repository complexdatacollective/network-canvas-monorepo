import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import { testId } from '@codaco/protocol-builder/testing/testId';
import {
  asEntityAttributeReference,
  type CurrentProtocol,
} from '@codaco/protocol-validation';
import { actionCreators as protocolActions } from '~/ducks/modules/activeProtocol';
import { deleteLayoutAsync } from '~/ducks/modules/protocol/codebook';
import { rootReducer } from '~/ducks/modules/root';
import { getProtocol } from '~/selectors/protocol';

// The delete confirmation is part of what these tests check.
vi.unmock('@codaco/fresco-ui/dialogs/useDialog');

import { templateTypeId } from '~/templates/__tests__/templateCodebookIds';
import { developmentProtocol } from '~/templates/development-protocol';

import Codebook from '../Codebook';

// The development protocol has five layouts: its first Sociogram and its
// Network Composer place people in closenessLayout, which its Narrative shows
// with anotherLayout; its second Sociogram places venues in Layout; nothing
// uses manualLayout or Layout_Manual.
const layoutId = (name: string) => {
  const entry = Object.entries(developmentProtocol.codebook.layouts ?? {}).find(
    ([, layout]) => layout.name === name,
  );
  if (!entry) throw new Error(`The protocol has no layout "${name}".`);
  return entry[0];
};

const stageId = (label: string) => {
  const stage = developmentProtocol.stages.find(
    (candidate) => candidate.label.en === label,
  );
  if (!stage) throw new Error(`The protocol has no stage "${label}".`);
  return stage.id;
};

const PERSON = templateTypeId(developmentProtocol, 'node', 'person');

const renderCodebook = (protocol: CurrentProtocol = developmentProtocol) => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  store.dispatch(protocolActions.setActiveProtocol(structuredClone(protocol)));
  render(
    <Provider store={store}>
      <QueryClientProvider client={new QueryClient()}>
        <DialogProvider>
          <Codebook />
        </DialogProvider>
      </QueryClientProvider>
    </Provider>,
  );
  return store;
};

const layoutEntry = (name: string) =>
  screen.getByRole('region', { name: `${name} layout` });

/** The names listed after `term` in an entry. */
const listed = (entry: HTMLElement, term: string) => {
  const definition = within(entry).getByText(term).nextElementSibling;
  if (!(definition instanceof HTMLElement)) {
    throw new Error(`Nothing is listed after "${term}".`);
  }
  return within(definition)
    .getAllByRole('listitem')
    .map((item) => item.textContent);
};

describe('the layouts on the Codebook page', () => {
  it('lists each layout with setting stages, reading stages and node types', () => {
    renderCodebook();

    const closeness = layoutEntry('closenessLayout');
    expect(listed(closeness, 'Stages that place nodes in it:')).toEqual([
      'Sociogram',
      'Network Composer',
    ]);
    expect(listed(closeness, 'Stages that show its positions:')).toEqual([
      'Narrative',
    ]);
    expect(listed(closeness, 'Node types that have positions in it:')).toEqual([
      'person',
    ]);
    expect(
      within(closeness).getByRole('link', { name: 'Narrative' }),
    ).toHaveAttribute('href', `/protocol/stage/${stageId('Narrative')}`);
    expect(
      within(closeness).getByRole('link', { name: 'person' }),
    ).toHaveAttribute(
      'href',
      `/protocol/codebook?entity=node&type=${encodeURIComponent(PERSON)}`,
    );

    // A layout that is only read has no node types with positions in it.
    const another = layoutEntry('anotherLayout');
    expect(listed(another, 'Stages that show its positions:')).toEqual([
      'Narrative',
    ]);
    expect(
      within(another).queryByText('Node types that have positions in it:'),
    ).not.toBeInTheDocument();
  });

  it('offers delete only for an unused layout', async () => {
    const store = renderCodebook();

    for (const name of ['closenessLayout', 'anotherLayout', 'Layout']) {
      expect(
        within(layoutEntry(name)).queryByRole('button', {
          name: 'Delete layout',
        }),
      ).not.toBeInTheDocument();
    }
    const unused = layoutEntry('manualLayout');
    expect(within(unused).getByText('not in use')).toBeInTheDocument();

    fireEvent.click(
      within(unused).getByRole('button', { name: 'Delete layout' }),
    );
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByTestId('dialog-primary'));

    await waitFor(() => {
      expect(
        getProtocol(store.getState())?.codebook.layouts,
      ).not.toHaveProperty(layoutId('manualLayout'));
    });
    expect(getProtocol(store.getState())?.codebook.layouts).toHaveProperty(
      layoutId('closenessLayout'),
    );
  });

  it('does not offer delete for a layout that only a filter rule names', () => {
    const protocol = structuredClone(developmentProtocol);
    const sociogram = protocol.stages.find(
      (stage) => stage.id === stageId('Sociogram'),
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
    renderCodebook(protocol);

    const named = layoutEntry('manualLayout');
    expect(listed(named, 'Stages with rules that name it:')).toEqual([
      'Sociogram',
    ]);
    expect(within(named).queryByText('not in use')).not.toBeInTheDocument();
    expect(
      within(named).queryByRole('button', { name: 'Delete layout' }),
    ).not.toBeInTheDocument();
  });

  it('refuses to delete a layout that a stage uses, whatever the page shows', async () => {
    const store = renderCodebook();

    await expect(
      store
        .dispatch(deleteLayoutAsync({ layoutId: layoutId('anotherLayout') }))
        .unwrap(),
    ).rejects.toThrow(/in use and cannot be deleted/);
    expect(getProtocol(store.getState())?.codebook.layouts).toHaveProperty(
      layoutId('anotherLayout'),
    );
  });

  it('a node type entry lists its layouts', () => {
    renderCodebook();

    const person = screen.getByRole('heading', { name: 'person node type' });
    const entry = person.closest('section');
    if (!(entry instanceof HTMLElement)) {
      throw new Error('The person node type has no section.');
    }
    expect(listed(entry, 'Layouts that have positions for this type:')).toEqual(
      ['closenessLayout'],
    );
    expect(
      within(entry).getByRole('link', { name: 'closenessLayout' }),
    ).toHaveAttribute('href', `#layout-${layoutId('closenessLayout')}`);
  });
});
