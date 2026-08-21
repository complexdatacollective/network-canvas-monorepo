import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { act, render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { analyseSyntheticFeasibility } from '@codaco/protocol-utilities';
import type { CurrentProtocol } from '@codaco/protocol-validation';
import {
  FIXTURE_DOCUMENT,
  PAIR_CEILING_DOCUMENT,
  parseFixture,
} from '~/components/SyntheticOverview/__tests__/fixtureProtocol';
import createTimeline from '~/ducks/middleware/timeline';
import activeProtocol, {
  setActiveProtocol,
} from '~/ducks/modules/activeProtocol';
import app from '~/ducks/modules/app';
import stageEditorDraft from '~/ducks/modules/stageEditorDraft';

import SyntheticOverviewPage from '../SyntheticOverviewPage';

/**
 * The `/protocol/synthetic` screen, end to end over a real store, the real
 * schema and the real feasibility gate.
 *
 * Nothing here is stubbed but the clock: the protocol goes into the editing
 * buffer as a DOCUMENT (which is what the buffer really holds), the page parses
 * it through `CurrentProtocolSchema`, and the verdict comes from the same
 * analysis `generateInterviews` refuses with. The conflict case asserts against
 * that analysis's own output rather than a copied string, so a reworded engine
 * refusal updates the expectation instead of failing the test — and a
 * PARAPHRASED one fails it.
 *
 * `protocolId` is deliberately left unset: these fixtures carry no roster or
 * Geospatial stage, so there is no pool to resolve and no asset store to touch.
 */

const DEBOUNCE = 500;

const createTestStore = () =>
  configureStore({
    reducer: combineReducers({
      app,
      stageEditorDraft,
      activeProtocol: createTimeline(activeProtocol),
    }),
  });

const renderPage = (document: unknown) => {
  const store = createTestStore();
  // Through `unknown` on purpose: the editing buffer is typed as parse output
  // for the editors' convenience but holds the stored document, which is the
  // very distinction this screen renders.
  store.dispatch(setActiveProtocol(document as CurrentProtocol));
  return render(
    <Provider store={store}>
      <SyntheticOverviewPage />
    </Provider>,
  );
};

const settle = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  window.history.replaceState(null, '', '/protocol/synthetic');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the page itself', () => {
  it('lands a route change on its own heading', async () => {
    renderPage(FIXTURE_DOCUMENT);
    await settle(DEBOUNCE);

    const heading = screen.getByRole('heading', {
      level: 1,
      name: 'Synthetic data',
    });
    expect(heading).toHaveAttribute('data-route-focus-target');
  });

  it('names both tables for assistive technology', async () => {
    renderPage(FIXTURE_DOCUMENT);
    await settle(DEBOUNCE);

    // A table with no accessible name is a wall of cells to a screen-reader
    // user, and this page has two of them side by side.
    expect(screen.getAllByRole('table')).toHaveLength(2);
    expect(screen.getByRole('table', { name: 'Stages' })).toBeVisible();
    expect(screen.getByRole('table', { name: 'Attributes' })).toBeVisible();
  });
});

describe('the protocol verdict', () => {
  it('says it is still checking before the analysis lands', () => {
    renderPage(FIXTURE_DOCUMENT);

    expect(screen.getByText('Checking this protocol…')).toBeVisible();
    expect(screen.queryByText('Generation is possible')).toBeNull();
  });

  it('says generation is possible once the analysis clears the protocol', async () => {
    renderPage(FIXTURE_DOCUMENT);
    await settle(DEBOUNCE);

    expect(screen.getByText('Generation is possible')).toBeVisible();
  });

  it('reports a draft that does not parse without pretending to have tables', async () => {
    renderPage({ schemaVersion: 8 });
    await settle(DEBOUNCE);

    expect(
      screen.getByText('This protocol cannot be checked yet'),
    ).toBeVisible();
    expect(screen.queryAllByRole('table')).toHaveLength(0);
  });

  it("renders the engine's refusal verbatim, and under the stage that owns it", async () => {
    const conflicts = analyseSyntheticFeasibility(
      parseFixture(PAIR_CEILING_DOCUMENT),
    );
    const reason = conflicts[0]?.reason;
    // Guards the fixture: a feasible protocol would make everything below
    // pass by saying nothing.
    expect(reason).toBeDefined();
    expect(reason).toContain('stage "Every pair"');

    renderPage(PAIR_CEILING_DOCUMENT);
    await settle(DEBOUNCE);

    expect(
      screen.getByText('Synthetic data cannot be generated'),
    ).toBeVisible();
    // Twice: once in the protocol verdict, once beneath the stage row that
    // owns it. Neither copy is reworded.
    expect(screen.getAllByText(reason as string)).toHaveLength(2);
  });
});

describe('the stage table', () => {
  it('links each stage to its own editor', async () => {
    renderPage(FIXTURE_DOCUMENT);
    await settle(DEBOUNCE);

    expect(
      screen.getByRole('link', { name: /^Close friends/ }),
    ).toHaveAttribute('href', '/protocol/stage/close-friends');
    expect(screen.getByRole('link', { name: /^Welcome/ })).toHaveAttribute(
      'href',
      '/protocol/stage/welcome',
    );
  });

  it('shows an authored parameter beside its badge', async () => {
    renderPage(FIXTURE_DOCUMENT);
    await settle(DEBOUNCE);

    const row = screen.getByRole('row', { name: /Close friends/ });
    expect(within(row).getByText('poisson(mean 4)')).toBeVisible();
    expect(within(row).getAllByText('Authored')).toHaveLength(2);
  });

  it('shows a resolved parameter as a default', async () => {
    renderPage(FIXTURE_DOCUMENT);
    await settle(DEBOUNCE);

    const row = screen.getByRole('row', { name: /Map connections/ });
    expect(
      within(row).getByText('mean degree normal(mean 3, sd 1)'),
    ).toBeVisible();
    expect(within(row).queryByText('Authored')).toBeNull();
  });

  it('explains a topology that can never be used instead of showing one', async () => {
    renderPage(FIXTURE_DOCUMENT);
    await settle(DEBOUNCE);

    const row = screen.getByRole('row', { name: /Position only/ });
    expect(
      within(row).getByText(
        'No prompt on this stage creates edges, so its edge topology is never used.',
      ),
    ).toBeVisible();
  });

  it('puts a panel under the stage that owns it', async () => {
    renderPage(FIXTURE_DOCUMENT);
    await settle(DEBOUNCE);

    const row = screen.getByRole('row', { name: /People you named/ });
    expect(within(row).getByText('30%')).toBeVisible();
  });
});

describe('the variable table', () => {
  it('links each attribute to its own row in the codebook', async () => {
    renderPage(FIXTURE_DOCUMENT);
    await settle(DEBOUNCE);

    // The whole destination rather than the page: a codebook listing every
    // attribute in the protocol is not somewhere "open the Codebook to change
    // them" usefully lands.
    expect(
      screen.getByRole('link', { name: 'age — open Person in the codebook' }),
    ).toHaveAttribute(
      'href',
      '/protocol/codebook?entity=node%3Aperson&variable=personAge',
    );
  });

  it('shows the resolved behaviour of an attribute nobody authored', async () => {
    renderPage(FIXTURE_DOCUMENT);
    await settle(DEBOUNCE);

    const row = screen.getByRole('row', { name: /uniform\(min 18, max 90\)/ });
    expect(within(row).getByText('Default')).toBeVisible();
  });

  it('states an interface-implied rule as a whole sentence', async () => {
    renderPage(FIXTURE_DOCUMENT);
    await settle(DEBOUNCE);

    expect(
      screen.getByText(
        'Always answered: “Quick add friends” cannot leave this attribute blank.',
      ),
    ).toBeVisible();
  });

  it('offers nothing that edits the protocol', async () => {
    renderPage(FIXTURE_DOCUMENT);
    await settle(DEBOUNCE);

    // The screen is read-only by design: no control on it can change a value.
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0);
  });
});
