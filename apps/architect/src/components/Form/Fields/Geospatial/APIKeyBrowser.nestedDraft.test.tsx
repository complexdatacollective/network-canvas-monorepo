import { combineReducers, configureStore } from '@reduxjs/toolkit';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';
import type { CurrentProtocol, Stage } from '@codaco/protocol-validation';
import { hasDirtyNestedDraft } from '~/components/DialogForm/nestedDraftRegistry';
import ArchitectField from '~/components/Form/ArchitectField';
import NestedDraftReclaimDialog from '~/components/NestedDraftReclaimDialog';
import createTimeline from '~/ducks/middleware/timeline';
import activeProtocol, {
  setActiveProtocol,
} from '~/ducks/modules/activeProtocol';
import app, {
  getProtocolLockState,
  setActiveProtocolId,
} from '~/ducks/modules/app';
import protocols from '~/ducks/modules/protocols';
import protocolValidation from '~/ducks/modules/protocolValidation';
import stageEditorDraft, {
  draftTimelineActions,
} from '~/ducks/modules/stageEditorDraft';
import { useProtocolNavGuard } from '~/hooks/useProtocolNavGuard';
import { useProtocolTabLock } from '~/hooks/useProtocolTabLock';
import type { ProtocolTabLock } from '~/utils/protocolTabLock';

import GeoAPIKey from './GeoAPIKey';

/**
 * The Resource Library listing is a shared, separately tested component whose
 * virtualised Collection measures a `font-size: var(--spacing-base)` probe on
 * mount, which jsdom cannot resolve. Stubbed for that reason alone — nothing
 * here is about the library, and the create form beside it is untouched.
 */
vi.mock('~/components/AssetBrowser/Assets', () => ({
  default: () => <div data-testid="resource-library" />,
}));

/**
 * `useProtocolNavGuard` reads the app's SINGLETON store rather than the one
 * behind the Provider, so the test store has to be installed where it looks.
 * This is the only substitution besides that listing: every reducer, selector,
 * guard, dialog and registry below is the real one, because the gap being
 * pinned here lives in exactly the wiring a stub would replace.
 */
const singleton = vi.hoisted(() => ({
  store: null as unknown as ReturnType<typeof createTestStore>,
}));
vi.mock('~/ducks/store', () => singleton);

const openDialogSpy = globalThis.__architectDialogMocks.openDialog;

const STAGE_EDITOR_PATH = '/protocol/stage/geospatial-1';
const PROTOCOL_PATH = '/protocol';

const protocol: CurrentProtocol = {
  name: 'Test Protocol',
  schemaVersion: 8,
  stages: [],
  codebook: {},
};

const stage = {
  id: 'geospatial-1',
  type: 'Geospatial',
  label: 'Where',
} as Stage;

const createTestStore = () =>
  configureStore({
    reducer: combineReducers({
      app,
      protocols,
      protocolValidation,
      stageEditorDraft,
      activeProtocol: createTimeline(activeProtocol),
    }),
  });

const makeFakeLock = () => {
  let onExclusivityChange: ((exclusive: boolean) => void) | undefined;
  const lock: ProtocolTabLock = {
    claimProtocol: () => undefined,
    releaseProtocol: () => undefined,
    isExclusive: () => true,
    close: () => undefined,
  };

  return {
    factory: (opts: { onExclusivityChange: (exclusive: boolean) => void }) => {
      onExclusivityChange = opts.onExclusivityChange;
      return lock;
    },
    fireExclusivity: (exclusive: boolean) => onExclusivityChange?.(exclusive),
  };
};

type Guard = Parameters<typeof useProtocolTabLock>;

const Guards = ({
  lockFactory,
  refreshActiveProtocol,
}: {
  lockFactory: Guard[0];
  refreshActiveProtocol: Guard[1];
}) => {
  useProtocolNavGuard();
  useProtocolTabLock(lockFactory, refreshActiveProtocol);
  return null;
};

const setup = () => {
  const store = createTestStore();
  singleton.store = store;
  store.dispatch(setActiveProtocol(protocol));
  store.dispatch(setActiveProtocolId('p1'));
  // A stage editor open on the Geospatial stage with nothing changed in it —
  // the ordinary situation the API-key browser is opened from, and the one in
  // which every guard the stage editor owns reads "pristine".
  store.dispatch(draftTimelineActions.reset({ stage, codebook: {} }));

  window.history.replaceState(null, '', PROTOCOL_PATH);
  window.history.pushState(null, '', STAGE_EDITOR_PATH);

  const fake = makeFakeLock();
  const refreshActiveProtocol = vi.fn(async () => 'restored');

  render(
    <Provider store={store}>
      <Guards
        lockFactory={fake.factory as Guard[0]}
        refreshActiveProtocol={refreshActiveProtocol as unknown as Guard[1]}
      />
      <NestedDraftReclaimDialog />
      <Form onSubmit={() => ({ success: true })}>
        <ArchitectField
          name="apiKey"
          label="Mapbox API key"
          component={GeoAPIKey}
        />
      </Form>
    </Provider>,
  );

  return { store, fake, refreshActiveProtocol };
};

const openBrowser = async () => {
  fireEvent.click(screen.getByRole('button', { name: /Select API key/ }));
  return await screen.findByRole('dialog', { name: 'API Key Browser' });
};

const typeHalfAKey = (dialog: HTMLElement) => {
  fireEvent.change(
    within(dialog).getByRole('textbox', { name: /API Key Name/ }),
    { target: { value: 'Mapbox' } },
  );
  fireEvent.change(
    within(dialog).getByRole('textbox', { name: /API Key Value/ }),
    { target: { value: 'pk.half' } },
  );
};

const typedValue = (dialog: HTMLElement) =>
  within(dialog).getByRole('textbox', { name: /API Key Value/ });

const pressBack = async () => {
  await act(async () => {
    window.history.back();
    // jsdom queues popstate as a task; let it run before anything is asserted.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

const reclaimFromAPeer = async (fake: ReturnType<typeof makeFakeLock>) => {
  act(() => {
    fake.fireExclusivity(false);
  });
  await act(async () => {
    fake.fireExclusivity(true);
    await Promise.resolve();
  });
};

const dialogTitles = () =>
  openDialogSpy.mock.calls.map(
    (call) => (call[0] as { title?: ReactNode }).title,
  );

/**
 * Issue #1387 made every nested editor declare its half-typed values, so that
 * the guards which can destroy them — browser Back, a refresh, a read-only
 * demotion, a cross-tab reclaim — stop and ask. The Geospatial API-key browser
 * was the last one declaring nothing: a modal `Dialog` around a two-field form,
 * rewritten by #1394 from a base that predated the registry. With a pristine
 * stage draft behind it — the ordinary case — every one of those guards read
 * the editor session as unchanged and threw the typed key away without a word.
 *
 * These tests drive the real guards over a store built from the real reducers.
 * Neither the registry, the lock, the nav guard nor the dialog is stubbed: a
 * harness that stubbed any of them would pass with the registration removed,
 * which is the failure mode this file exists to rule out.
 */
describe('a half-typed API key is unsaved work', () => {
  beforeEach(() => {
    openDialogSpy.mockResolvedValue(true);
  });

  it('is declared to the registry every guard consults', async () => {
    setup();
    const dialog = await openBrowser();

    expect(hasDirtyNestedDraft()).toBe(false);

    typeHalfAKey(dialog);

    expect(hasDirtyNestedDraft()).toBe(true);
  });

  it('stops browser Back, and survives when the researcher cancels', async () => {
    // The researcher says no to the discard, so Back must be undone and the
    // dialog left exactly as it was.
    openDialogSpy.mockResolvedValue(false);
    setup();
    const dialog = await openBrowser();
    typeHalfAKey(dialog);

    await pressBack();

    await waitFor(() =>
      expect(dialogTitles()).toContain('Discard unsaved changes?'),
    );
    expect(window.location.pathname).toBe(STAGE_EDITOR_PATH);
    expect(
      screen.getByRole('dialog', { name: 'API Key Browser' }),
    ).toBeInTheDocument();
    expect(typedValue(dialog)).toHaveValue('pk.half');
  });

  // The control that makes the assertion above mean something: Back out of a
  // browser nobody has typed into is an ordinary navigation and must not ask.
  it('lets browser Back through when the key form is untouched', async () => {
    setup();
    await openBrowser();

    await pressBack();

    await waitFor(() => expect(window.location.pathname).toBe(PROTOCOL_PATH));
    expect(dialogTitles()).not.toContain('Discard unsaved changes?');
  });

  it('blocks a cross-tab reclaim instead of letting it navigate out from under the dialog', async () => {
    const { store, fake, refreshActiveProtocol } = setup();
    const dialog = await openBrowser();
    typeHalfAKey(dialog);

    await reclaimFromAPeer(fake);

    // The reclaim is held, so nothing that would take the typed key has run:
    // the canonical row is not re-read, and `closeEditorAndReclaim` has not
    // navigated the stage editor — and this dialog with it — away.
    expect(getProtocolLockState(store.getState())).toBe('reclaim-blocked');
    expect(refreshActiveProtocol).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe(STAGE_EDITOR_PATH);
    expect(typedValue(dialog)).toHaveValue('pk.half');
    // …and the researcher is told what the wait is for, rather than left with a
    // tab that silently refuses every write.
    await waitFor(() =>
      expect(dialogTitles()).toContain('An editor is still open'),
    );
  });

  // The same control for the reclaim: with nothing typed there is nothing to
  // rescue, so it must complete rather than strand the tab.
  it('lets a cross-tab reclaim complete when the key form is untouched', async () => {
    const { store, fake, refreshActiveProtocol } = setup();
    await openBrowser();

    await reclaimFromAPeer(fake);

    await waitFor(() => expect(refreshActiveProtocol).toHaveBeenCalled());
    expect(getProtocolLockState(store.getState())).not.toBe('reclaim-blocked');
  });

  it('asks before its own Cancel throws the typed key away', async () => {
    openDialogSpy.mockResolvedValue(false);
    setup();
    const dialog = await openBrowser();
    typeHalfAKey(dialog);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(dialogTitles()).toContain('Unsaved Changes'));
    expect(
      screen.getByRole('dialog', { name: 'API Key Browser' }),
    ).toBeInTheDocument();
    expect(typedValue(dialog)).toHaveValue('pk.half');
  });
});
