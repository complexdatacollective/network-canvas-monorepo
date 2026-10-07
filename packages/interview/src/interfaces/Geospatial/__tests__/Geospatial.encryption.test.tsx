import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  asEntityAttributeReference,
  type Variable,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
  type NcNode,
} from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import { ContractProvider } from '../../../contract/context';
import { InterviewI18nProvider } from '../../../i18n/InterviewI18nProvider';
import { setPassphrase } from '../../../store/modules/ui';
import { interviewToastManager } from '../../../toast/interviewToastManager';
import type { StageProps } from '../../../types';
import { createEncryptionStore } from '../../Anonymisation/__tests__/encryptionFixtures';
import { isNumberArray } from '../../Anonymisation/decryptionScope';
import { decryptData } from '../../Anonymisation/utils';
import GeospatialInterface from '../Geospatial';

// The stage is driven through its stub map (jsdom's user agent is not
// Chrome's), so no real map is ever built.
vi.mock('mapbox-gl/esm', () => ({ Map: vi.fn() }));

// Holds back the result of the next encryption while `held` is set, so a
// test can make an earlier save slower than a later one. Counts every
// encryption begun and ended, so a test can wait for all of them.
const encryptionGate = vi.hoisted(() => {
  const gate: { held?: Promise<void>; begun: number; ended: number } = {
    begun: 0,
    ended: 0,
  };
  return gate;
});
vi.mock('../../Anonymisation/utils', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../Anonymisation/utils')>();
  return {
    ...actual,
    generateSecureAttributes: async (
      ...args: Parameters<typeof actual.generateSecureAttributes>
    ) => {
      encryptionGate.begun += 1;
      const held = encryptionGate.held;
      encryptionGate.held = undefined;
      try {
        const result = await actual.generateSecureAttributes(...args);
        await held;
        return result;
      } finally {
        encryptionGate.ended += 1;
      }
    },
  };
});

class StubObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', StubObserver);
  vi.stubGlobal('IntersectionObserver', StubObserver);
});

const variables: Record<string, Variable> = {
  name: { name: 'name', type: 'text', component: 'Text' },
  neighbourhood: {
    name: 'Neighbourhood',
    type: 'text',
    component: 'Text',
    encrypted: true,
  },
};

const stage: StageProps<'Geospatial'>['stage'] = {
  id: 'geospatial-stage',
  type: 'Geospatial',
  label: 'Where people live',
  subject: { entity: 'node', type: 'person' },
  mapOptions: {
    tokenAssetId: 'mapbox-token',
    style: 'mapbox://styles/mapbox/standard',
    center: [0, 0],
    initialZoom: 10,
    dataSourceAssetId: 'geojson-data',
    color: 'ord-color-seq-1',
    targetFeatureProperty: 'name',
  },
  prompts: [
    {
      id: 'prompt-1',
      text: 'Where does this person live?',
      variable: asEntityAttributeReference('neighbourhood'),
    },
  ],
};

const person: NcNode = {
  [entityPrimaryKeyProperty]: 'n1',
  type: 'person',
  [entityAttributesProperty]: { name: 'Alice' },
};

function renderGeospatial(passphrase?: string, encryptionEnabled = true) {
  const store = createEncryptionStore([person], [stage], variables, {
    encryptionEnabled,
  });
  if (passphrase) store.dispatch(setPassphrase(passphrase));

  render(
    <ContractProvider
      onFinish={vi.fn()}
      onRequestAsset={async () =>
        'data:application/json,{"features":[{"properties":{"name":"Riverside"}}]}'
      }
      flags={{ isE2E: true }}
    >
      <Provider store={store}>
        <InterviewI18nProvider requestedLocale="en">
          <CurrentStepProvider currentStep={0} onStepChange={vi.fn()}>
            <GeospatialInterface
              stage={stage}
              getNavigationHelpers={() => ({
                moveForward: vi.fn(),
                moveBackward: vi.fn(),
              })}
            />
          </CurrentStepProvider>
        </InterviewI18nProvider>
      </Provider>
    </ContractProvider>,
  );

  const waitForMap = () =>
    waitFor(() =>
      expect(screen.getByTestId('map-container')).toHaveAttribute(
        'data-map-idle',
        'true',
      ),
    );

  const selectArea = async () => {
    await waitForMap();
    act(() => {
      fireEvent.click(screen.getByTestId('geospatial-stub-click-area'));
    });
  };

  return { store, selectArea, waitForMap };
}

describe('Geospatial asking for an encrypted location', () => {
  it('asks for the passphrase instead of taking a location it could not save', async () => {
    const toast = vi.spyOn(interviewToastManager, 'add');
    const { store, selectArea } = renderGeospatial();
    const before = store.getState().session.network;

    await selectArea();

    expect(store.getState().ui.showPassphrasePrompter).toBe(true);
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining(
          'Some answers here are protected by your passphrase.',
        ),
      }),
    );
    expect(store.getState().session.network).toBe(before);
  });

  it('saves the location encrypted once the passphrase is in force', async () => {
    const { store, selectArea } = renderGeospatial('pw');

    await selectArea();

    await waitFor(() =>
      expect(
        isNumberArray(
          store.getState().session.network.nodes[0]?.[entityAttributesProperty]
            .neighbourhood,
        ),
      ).toBe(true),
    );
    const [saved] = store.getState().session.network.nodes;
    const data = saved?.[entityAttributesProperty].neighbourhood;
    const secureAttributes = saved?.[entitySecureAttributesMeta]?.neighbourhood;
    if (!isNumberArray(data)) throw new Error('Expected a stored ciphertext');
    if (!secureAttributes)
      throw new Error('Expected secure-attribute metadata');
    await expect(decryptData({ secureAttributes, data }, 'pw')).resolves.toBe(
      'Riverside',
    );
  });
});

describe('Geospatial saving locations in the order they were picked', () => {
  it('stores the later location when the earlier one is still being protected', async () => {
    const { store, selectArea } = renderGeospatial('pw');
    const begunBefore = encryptionGate.begun;
    let release: () => void = () => undefined;
    encryptionGate.held = new Promise((resolve) => {
      release = resolve;
    });

    await selectArea();
    await waitFor(() => expect(encryptionGate.begun).toBe(begunBefore + 1));
    act(() => {
      fireEvent.click(screen.getByTestId('outside-selectable-areas-button'));
    });
    // Long enough for a later location that did not wait for the earlier one to
    // be stored first.
    await act(() => new Promise((resolve) => setTimeout(resolve, 500)));
    release();

    await waitFor(() => expect(encryptionGate.begun).toBe(begunBefore + 2));
    await waitFor(() =>
      expect(encryptionGate.ended).toBe(encryptionGate.begun),
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    const [saved] = store.getState().session.network.nodes;
    const data = saved?.[entityAttributesProperty].neighbourhood;
    const secureAttributes = saved?.[entitySecureAttributesMeta]?.neighbourhood;
    if (!isNumberArray(data)) throw new Error('Expected a stored ciphertext');
    if (!secureAttributes)
      throw new Error('Expected secure-attribute metadata');
    await expect(decryptData({ secureAttributes, data }, 'pw')).resolves.toBe(
      'outside-selectable-areas',
    );
  });
});

describe('Geospatial showing an encrypted location', () => {
  it('stops showing the saved location once the passphrase that read it is replaced', async () => {
    const { store, waitForMap } = renderGeospatial('pw');
    await waitForMap();

    act(() => {
      fireEvent.click(screen.getByTestId('outside-selectable-areas-button'));
    });
    expect(
      await screen.findByTestId('outside-selectable-overlay'),
    ).toBeVisible();

    act(() => {
      store.dispatch(setPassphrase('another passphrase'));
    });

    await waitFor(() =>
      expect(store.getState().ui.passphraseInvalid).toBe(true),
    );
    expect(screen.queryByTestId('outside-selectable-overlay')).toBeNull();
  });
});

describe('Geospatial with the encrypted-variables experiment off', () => {
  it('saves the location as plaintext without asking for a passphrase', async () => {
    const { store, selectArea } = renderGeospatial(undefined, false);

    await selectArea();

    await waitFor(() =>
      expect(
        store.getState().session.network.nodes[0]?.[entityAttributesProperty]
          .neighbourhood,
      ).toBe('Riverside'),
    );
    expect(
      store.getState().session.network.nodes[0]?.[entitySecureAttributesMeta],
    ).toBeUndefined();
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);
  });
});
