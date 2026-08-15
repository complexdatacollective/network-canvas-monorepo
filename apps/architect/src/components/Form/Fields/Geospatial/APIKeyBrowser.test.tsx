import { configureStore } from '@reduxjs/toolkit';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { useContext, type ContextType } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';
import ArchitectField from '~/components/Form/ArchitectField';
import assetManifestReducer, {
  type Asset,
} from '~/ducks/modules/protocol/assetManifest';

/**
 * The Resource Library listing is a shared, separately tested component, and
 * its virtualised Collection measures a `font-size: var(--spacing-base)` probe
 * on mount — which jsdom 30 cannot resolve and throws on. Stubbing it keeps
 * this file about the create-validate-select contract.
 *
 * It still lists cards, because picking an existing one is half that contract:
 * one button per asset in the library, calling the same one-argument
 * `onSelect` the real `Collection` calls. The card's NAME is deliberately not
 * handed back — the announcement has to be read from the manifest, and a stub
 * that supplied the name would hide a missing lookup.
 */
const library = vi.hoisted(() => ({ ids: [] as string[] }));

vi.mock('~/components/AssetBrowser/Assets', () => ({
  default: ({ onSelect }: { onSelect?: (id: string) => void }) => (
    <div data-testid="resource-library">
      {library.ids.map((id) => (
        <button key={id} type="button" onClick={() => onSelect?.(id)}>
          Choose {id}
        </button>
      ))}
    </div>
  ),
}));

import GeoAPIKey from './GeoAPIKey';

/**
 * Issue #1394. Creating an API key used to be fire-and-forget: the dialog
 * stayed open with both fields still populated, said nothing, and minted
 * another asset on every further activation — same name, same value, different
 * uuid — which the Resource Library here cannot delete.
 *
 * The whole field is rendered (not a mocked browser) because the guarantees
 * span both components: the browser validates and closes, and GeoAPIKey shows
 * and announces the result.
 */

type ProtocolState = {
  name: string;
  stages: [];
  codebook: { node: object; edge: object; ego: object };
  assetManifest: Record<string, Asset>;
};

type TestState = {
  activeProtocol: { present: ProtocolState };
  // `getProtocolLockState` reads `app.protocolLockState` and treats anything
  // unrecognised as 'owned', so the default here is the ordinary case.
  app: { protocolLockState: string };
};

const makeStore = (
  assetManifest: Record<string, Asset> = {},
  protocolLockState = 'owned',
) => {
  const initial: TestState = {
    activeProtocol: {
      present: {
        name: 'Test protocol',
        stages: [],
        codebook: { node: {}, edge: {}, ego: {} },
        assetManifest,
      },
    },
    app: { protocolLockState },
  };

  // The real asset-manifest reducer, mounted where the protocol selectors look
  // for it, so `addApiKeyAsset` writes exactly what it writes in the app.
  return configureStore({
    reducer: (state: TestState = initial, action) => ({
      ...state,
      activeProtocol: {
        ...state.activeProtocol,
        present: {
          ...state.activeProtocol.present,
          assetManifest: assetManifestReducer(
            state.activeProtocol.present.assetManifest,
            action,
          ),
        },
      },
    }),
  });
};

/**
 * GeoAPIKey's OWN status region, scoped to the field's fieldset. A bare
 * `[aria-live]` query would find the always-mounted FieldErrors region that
 * every `Field` renders and pass whether or not this one exists.
 */
const statusRegion = () =>
  document.querySelector('[data-name="apiKey"] [aria-live="polite"]');

const apiKeyAssets = (store: ReturnType<typeof makeStore>) =>
  Object.values(store.getState().activeProtocol.present.assetManifest).filter(
    (asset) => asset.type === 'apikey',
  );

type StoreApi = NonNullable<ContextType<typeof FormStoreContext>>;

const setup = (
  assetManifest: Record<string, Asset> = {},
  protocolLockState = 'owned',
) => {
  const store = makeStore(assetManifest, protocolLockState);
  library.ids = Object.keys(assetManifest);
  let formStore: StoreApi | null = null;
  const CaptureStore = () => {
    formStore = useContext(FormStoreContext) ?? null;
    return null;
  };

  render(
    <Provider store={store}>
      <Form onSubmit={() => ({ success: true })}>
        <CaptureStore />
        <ArchitectField
          name="apiKey"
          label="Mapbox API key"
          component={GeoAPIKey}
        />
      </Form>
    </Provider>,
  );

  return {
    store,
    getFieldValue: () => {
      if (!formStore) throw new Error('form store was not captured');
      return formStore.getState().getFormValues().apiKey;
    },
    openBrowser: async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /(Select|Update) API key/ }),
      );
      return await screen.findByRole('dialog', { name: 'API Key Browser' });
    },
  };
};

const fillAndSubmit = (
  dialog: HTMLElement,
  { name, value }: { name: string; value: string },
) => {
  fireEvent.change(
    within(dialog).getByRole('textbox', { name: /API Key Name/ }),
    { target: { value: name } },
  );
  fireEvent.change(
    within(dialog).getByRole('textbox', { name: /API Key Value/ }),
    { target: { value } },
  );
  fireEvent.click(within(dialog).getByRole('button', { name: 'Create Key' }));
};

const EXISTING_KEY: Record<string, Asset> = {
  'existing-key': {
    id: 'existing-key',
    type: 'apikey',
    name: 'Mapbox Production',
    value: 'pk.existing',
  },
};

describe('API key creation', () => {
  it('mounts the live region with the field, before any dialog opens', () => {
    const { store } = setup();

    const region = statusRegion();
    expect(region).toBeInTheDocument();
    expect(region?.textContent).toBe('');
    expect(apiKeyAssets(store)).toHaveLength(0);
  });

  // Guards the P0 form work this fix depends on rather than duplicates: an
  // invalid submit must focus and announce the first offending field. The
  // filed report said it did not; it does.
  it('focuses and announces the first field when Create is pressed empty', async () => {
    const { store, openBrowser } = setup();
    const dialog = await openBrowser();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Create Key' }));

    const nameInput = within(dialog).getByRole('textbox', {
      name: /API Key Name/,
    });
    await waitFor(() => expect(nameInput).toHaveFocus());
    expect(nameInput).toHaveAttribute('aria-invalid', 'true');

    const describedBy = nameInput.getAttribute('aria-describedby') ?? '';
    const errorRegion = describedBy
      .split(' ')
      .map((id) => document.getElementById(id))
      .find((element) => element?.getAttribute('aria-live') === 'polite');
    expect(errorRegion).toHaveTextContent(/required/i);

    expect(apiKeyAssets(store)).toHaveLength(0);
    expect(dialog).toBeInTheDocument();
  });

  // Also already true before this fix — field-level `required` treats
  // whitespace-only text as unanswered. Pinned so the submit-time trim added
  // here can never be read as licence to drop it.
  it('refuses a name that is only whitespace', async () => {
    const { store, openBrowser } = setup();
    const dialog = await openBrowser();

    fillAndSubmit(dialog, { name: '   ', value: 'pk.something' });

    const nameInput = within(dialog).getByRole('textbox', {
      name: /API Key Name/,
    });
    await waitFor(() => expect(nameInput).toHaveFocus());
    expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    expect(apiKeyAssets(store)).toHaveLength(0);
  });

  it('refuses a name already in use, ignoring case and surrounding space', async () => {
    const { store, openBrowser } = setup(EXISTING_KEY);
    const dialog = await openBrowser();

    fillAndSubmit(dialog, {
      name: '  mapbox production  ',
      value: 'pk.duplicate',
    });

    const nameInput = within(dialog).getByRole('textbox', {
      name: /API Key Name/,
    });
    await waitFor(() =>
      expect(
        within(dialog).getByText(
          'A key with this name already exists. Choose a different name.',
        ),
      ).toBeInTheDocument(),
    );
    expect(nameInput).toHaveFocus();
    expect(apiKeyAssets(store)).toHaveLength(1);
    expect(dialog).toBeInTheDocument();
  });

  it('refuses to create a key in a tab that cannot save, and says why', async () => {
    // #1396 gave the sibling write — dropping a resource file — this refusal;
    // this path was rewritten by #1394 from a base that predated it and never
    // gained one. A tab holding no lock was told "API key X created and
    // selected." and then lost the key on reclaim: a write announced as a
    // success and silently discarded.
    const { store, openBrowser } = setup({}, 'open-elsewhere');
    const dialog = await openBrowser();

    fillAndSubmit(dialog, { name: 'Mapbox', value: 'pk.blocked' });

    await waitFor(() =>
      expect(
        within(dialog).getByText(
          'This protocol is open in another tab, which holds the saved copy. Close the other tab, then create the key again.',
        ),
      ).toBeInTheDocument(),
    );
    // Nothing written, and the dialog stays open holding the typed values so
    // the researcher can deal with the other tab and submit again.
    expect(apiKeyAssets(store)).toHaveLength(0);
    expect(dialog).toBeInTheDocument();
    expect(
      within(dialog).getByRole('textbox', { name: /API Key Name/ }),
    ).toHaveFocus();
  });

  /**
   * This form is now a registered nested draft, so by the time a submit is
   * refused — both fields filled — it is itself one of the things the blocked
   * reclaim is waiting on. The refusal used to name the STAGE's unsaved changes
   * and tell the researcher to answer a question about them, which was true
   * only while this dialog was invisible to the registry: with a pristine stage
   * behind it there is no such question, and cancelling this form is the whole
   * way out.
   */
  it('names this form as what the blocked reclaim is waiting on', async () => {
    const { store, openBrowser } = setup({}, 'reclaim-blocked');
    const dialog = await openBrowser();

    fillAndSubmit(dialog, { name: 'Mapbox', value: 'pk.blocked' });

    await waitFor(() =>
      expect(
        within(dialog).getByText(
          'The other tab has closed, so the saved copy of this protocol has to be read back into this tab before anything can be saved here, and this form is holding that up. Cancel it to let the protocol be read back, then create the key again.',
        ),
      ).toBeInTheDocument(),
    );
    expect(apiKeyAssets(store)).toHaveLength(0);
  });

  it('creates the key, selects it, closes the dialog and announces it', async () => {
    const { store, openBrowser, getFieldValue } = setup();
    const dialog = await openBrowser();

    fillAndSubmit(dialog, {
      name: '  My Test Key  ',
      value: '  pk.testvalue123  ',
    });

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'API Key Browser' }),
      ).not.toBeInTheDocument(),
    );

    const created = apiKeyAssets(store);
    expect(created).toHaveLength(1);
    // Stored trimmed, so " My Test Key " and "My Test Key" cannot coexist.
    expect(created[0]).toMatchObject({
      name: 'My Test Key',
      value: 'pk.testvalue123',
    });
    expect(getFieldValue()).toBe(created[0]!.id);

    expect(statusRegion()).toHaveTextContent(
      'API key My Test Key created and selected.',
    );
    expect(
      screen.getByRole('button', { name: 'Update API key' }),
    ).toBeInTheDocument();
  });

  /**
   * The status region describes what the FIELD holds, so every route out of
   * the browser has to rewrite it. Announcing only creations left the last
   * created key's sentence standing over a later selection: a screen reader
   * browsing the fieldset read "API key Alpha created and selected." beside a
   * control holding Mapbox Production — and the selection that actually
   * happened was announced by nothing at all.
   */
  it('announces the key picked from the library, replacing the created one', async () => {
    const { openBrowser, getFieldValue } = setup(EXISTING_KEY);

    const dialog = await openBrowser();
    fillAndSubmit(dialog, { name: 'Alpha', value: 'pk.alpha' });
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'API Key Browser' }),
      ).not.toBeInTheDocument(),
    );
    expect(statusRegion()).toHaveTextContent(
      'API key Alpha created and selected.',
    );

    const reopened = await openBrowser();
    fireEvent.click(
      within(reopened).getByRole('button', { name: 'Choose existing-key' }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'API Key Browser' }),
      ).not.toBeInTheDocument(),
    );
    expect(getFieldValue()).toBe('existing-key');
    // The name comes from the manifest, not from the card that was clicked.
    expect(statusRegion()).toHaveTextContent(
      'API key Mapbox Production selected.',
    );
    expect(statusRegion()).not.toHaveTextContent('Alpha');
  });

  it('cannot create a second key with the same name by submitting again', async () => {
    const { store, openBrowser } = setup();

    const dialog = await openBrowser();
    fillAndSubmit(dialog, {
      name: 'My Test Key',
      value: 'pk.testvalue123',
    });
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'API Key Browser' }),
      ).not.toBeInTheDocument(),
    );

    // The create form starts empty on the next visit — the filed complaint was
    // that both fields stayed populated, inviting exactly this repeat.
    const reopened = await openBrowser();
    expect(
      within(reopened).getByRole('textbox', { name: /API Key Name/ }),
    ).toHaveValue('');
    expect(
      within(reopened).getByRole('textbox', { name: /API Key Value/ }),
    ).toHaveValue('');

    fillAndSubmit(reopened, {
      name: 'My Test Key',
      value: 'pk.testvalue123',
    });

    await waitFor(() =>
      expect(
        within(reopened).getByText(
          'A key with this name already exists. Choose a different name.',
        ),
      ).toBeInTheDocument(),
    );
    expect(apiKeyAssets(store)).toHaveLength(1);
  });
});
