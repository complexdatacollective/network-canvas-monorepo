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

import {
  protocolShowingUnplacedLayout,
  SHOWN_ONLY_LAYOUT,
} from '~/templates/__tests__/layoutReadFixtures';
import { templateTypeId } from '~/templates/__tests__/templateCodebookIds';
import { developmentProtocol } from '~/templates/development-protocol';

import Codebook from '../Codebook';

// The fixture's first Sociogram and its Network Composer place people in
// closenessLayout, which its Narrative shows with shownOnlyLayout, a layout
// no stage places nodes in; its second Sociogram places venues in Layout;
// nothing uses manualLayout, anotherLayout or Layout_Manual.
const FIXTURE = protocolShowingUnplacedLayout().protocol;

const layoutId = (name: string) => {
  const entry = Object.entries(FIXTURE.codebook.layouts ?? {}).find(
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

const renderCodebook = (protocol: CurrentProtocol = FIXTURE) => {
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

const typeEntry = (heading: string) => {
  const entry = screen
    .getByRole('heading', { name: heading })
    .closest('section');
  if (!(entry instanceof HTMLElement)) {
    throw new Error(`The ${heading} has no section.`);
  }
  return entry;
};

const personEntry = () => typeEntry('person node type');

const LAYOUTS_ROW = 'Layouts that have positions for this type:';

/** The element an in-page link points at, if it is on the page. */
const linkTarget = (link: HTMLElement) =>
  document.getElementById(link.getAttribute('href')?.slice(1) ?? '');

const expectEveryLayoutLinkToResolve = () => {
  const links = [...document.querySelectorAll('a[href^="#layout-"]')];
  for (const link of links) {
    if (!(link instanceof HTMLElement)) continue;
    expect(linkTarget(link), link.getAttribute('href') ?? '').not.toBeNull();
  }
};

const search = (term: string) => {
  fireEvent.change(
    screen.getByRole('searchbox', { name: 'Search the codebook by name' }),
    { target: { value: term } },
  );
};

const showUnusedOnly = () => {
  fireEvent.click(screen.getByRole('checkbox', { name: 'Show unused only' }));
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
    const shownOnly = layoutEntry(SHOWN_ONLY_LAYOUT.name);
    expect(listed(shownOnly, 'Stages that show its positions:')).toEqual([
      'Narrative',
    ]);
    expect(
      within(shownOnly).queryByText('Node types that have positions in it:'),
    ).not.toBeInTheDocument();
  });

  it('offers delete only for an unused layout', async () => {
    const store = renderCodebook();

    for (const name of ['closenessLayout', SHOWN_ONLY_LAYOUT.name, 'Layout']) {
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

  it('moves focus to the layouts heading once a layout is deleted', async () => {
    renderCodebook();

    fireEvent.click(
      within(layoutEntry('manualLayout')).getByRole('button', {
        name: 'Delete layout',
      }),
    );
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByTestId('dialog-primary'));

    // The button that opened the dialog went with its entry, so focus would
    // otherwise fall back to the top of the page.
    const heading = await screen.findByRole('heading', {
      level: 2,
      name: 'Layouts (5)',
    });
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it('counts the layouts in the heading', () => {
    renderCodebook();

    // The development protocol's five, and shownOnlyLayout.
    expect(
      screen.getByRole('heading', { level: 2, name: 'Layouts (6)' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/No layouts yet/)).not.toBeInTheDocument();
  });

  it('says so when the protocol has no layouts', () => {
    const protocol = structuredClone(FIXTURE);
    protocol.codebook.layouts = {};
    renderCodebook(protocol);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Layouts (0)' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/No layouts yet/)).toBeInTheDocument();
  });

  it('does not offer delete for a layout that only a filter rule names', () => {
    const protocol = structuredClone(FIXTURE);
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
        .dispatch(deleteLayoutAsync({ layoutId: SHOWN_ONLY_LAYOUT.id }))
        .unwrap(),
    ).rejects.toThrow(/in use and cannot be deleted/);
    expect(getProtocol(store.getState())?.codebook.layouts).toHaveProperty(
      SHOWN_ONLY_LAYOUT.id,
    );
  });

  it('a node type entry lists its layouts', () => {
    renderCodebook();

    const entry = personEntry();
    expect(listed(entry, 'Layouts that have positions for this type:')).toEqual(
      ['closenessLayout'],
    );
    const link = within(entry).getByRole('link', { name: 'closenessLayout' });
    expect(link).toHaveAttribute(
      'href',
      `#layout-${layoutId('closenessLayout')}`,
    );
    expect(linkTarget(link)).toBe(layoutEntry('closenessLayout'));
  });

  it('lists no layouts on a node type that no stage places, or on an edge type', () => {
    const VENUE = templateTypeId(developmentProtocol, 'node', 'venue');
    const protocol = structuredClone(FIXTURE);
    protocol.stages = protocol.stages.filter(
      (stage) =>
        !(stage.type === 'Sociogram' || stage.type === 'NetworkComposer') ||
        !stage.subject.types.includes(VENUE),
    );
    renderCodebook(protocol);

    expect(listed(personEntry(), LAYOUTS_ROW)).toEqual(['closenessLayout']);
    expect(
      within(typeEntry('venue node type')).queryByText(LAYOUTS_ROW),
    ).not.toBeInTheDocument();
    expect(
      within(typeEntry('friend edge type')).queryByText(LAYOUTS_ROW),
    ).not.toBeInTheDocument();
  });

  it('brings a layout entry into view below the navigation bar', () => {
    renderCodebook();

    const target = layoutEntry('closenessLayout');
    const scrollIntoView = vi.fn<(options?: ScrollIntoViewOptions) => void>();
    target.scrollIntoView = scrollIntoView;

    const followed = fireEvent.click(
      within(personEntry()).getByRole('link', { name: 'closenessLayout' }),
    );

    // The browser's own jump to the anchor is replaced, not added to.
    expect(followed).toBe(false);
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    });
    expect(target.style.scrollMarginTop).toContain('--architect-nav-height');
    expect(target).toHaveFocus();
  });

  it('lists only the layouts whose names match the search', () => {
    renderCodebook();

    search('closeness');

    expect(layoutEntry('closenessLayout')).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'manualLayout layout' }),
    ).not.toBeInTheDocument();
  });

  it('lists only unused layouts under "Show unused only"', () => {
    renderCodebook();

    showUnusedOnly();

    expect(layoutEntry('manualLayout')).toBeInTheDocument();
    for (const name of ['closenessLayout', SHOWN_ONLY_LAYOUT.name, 'Layout']) {
      expect(
        screen.queryByRole('region', { name: `${name} layout` }),
      ).not.toBeInTheDocument();
    }
  });

  it('does not link a node type to a layout the search hides', () => {
    renderCodebook();

    search('person');

    const entry = personEntry();
    expect(listed(entry, 'Layouts that have positions for this type:')).toEqual(
      ['closenessLayout'],
    );
    expectEveryLayoutLinkToResolve();
    expect(
      within(entry).queryByRole('link', { name: 'closenessLayout' }),
    ).not.toBeInTheDocument();
  });

  it('does not link a node type to a layout "Show unused only" hides', () => {
    renderCodebook();

    showUnusedOnly();

    // The person type stays listed for its unused attributes.
    const entry = personEntry();
    expect(listed(entry, 'Layouts that have positions for this type:')).toEqual(
      ['closenessLayout'],
    );
    expectEveryLayoutLinkToResolve();
    expect(
      within(entry).queryByRole('link', { name: 'closenessLayout' }),
    ).not.toBeInTheDocument();
  });
});
