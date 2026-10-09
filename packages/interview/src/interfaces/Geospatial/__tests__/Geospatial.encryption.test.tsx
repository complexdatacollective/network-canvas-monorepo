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
  type NcNode,
} from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import { ContractProvider } from '../../../contract/context';
import { InterviewI18nProvider } from '../../../i18n/InterviewI18nProvider';
import { WritesInFlightProvider } from '../../../store/WritesInFlightContext';
import { interviewToastManager } from '../../../toast/interviewToastManager';
import type { StageProps } from '../../../types';
import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';
import {
  createEncryptionStore,
  encryptionFor,
  unlockWith,
} from '../../Anonymisation/__tests__/encryptionFixtures';
import { readEncryptedAttribute } from '../../Anonymisation/decryptionScope';
import { decryptValue } from '../../Anonymisation/encryptionFormat';
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
  name: { name: 'name', label: 'name', type: 'text', component: 'Text' },
  neighbourhood: {
    name: 'Neighbourhood',
    label: 'Neighbourhood',
    type: 'text',
    component: 'Text',
    encrypted: true,
  },
};

const stage: StageProps<'Geospatial'>['stage'] = {
  id: 'geospatial-stage',
  type: 'Geospatial',
  offlineNotice: {
    en: 'You are offline — the map will not load until you reconnect.',
  },
  mapUnavailable: {
    en: 'This can happen if your browser or device does not support the features the map requires (for example, WebGL). Try a different browser or device, or contact the study organizer. You may be able to continue your interview by selecting the next arrow.',
  },
  outsideAreasLabel: { en: 'Outside Selectable Areas' },
  label: { en: 'Where people live' },
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
      text: { en: 'Where does this person live?' },
      variable: asEntityAttributeReference('neighbourhood'),
    },
  ],
};

const person: NcNode = {
  [entityPrimaryKeyProperty]: 'n1',
  type: 'person',
  [entityAttributesProperty]: { name: 'Alice' },
};

async function renderGeospatial({ unlocked = false } = {}) {
  const { header } = await encryptionFor('pw');
  const store = createEncryptionStore([person], [stage], variables, {
    header,
  });
  if (unlocked) await unlockWith(store, 'pw');

  render(
    <ContractProvider
      onFinish={vi.fn()}
      onRequestAsset={async () =>
        'data:application/json,{"features":[{"properties":{"name":"Riverside"}}]}'
      }
      flags={{ isE2E: true }}
    >
      <Provider store={store}>
        <WritesInFlightProvider
          writesSettled={store.writesSettled}
          trackWrite={store.trackWrite}
        >
          <TestProtocolLocalization>
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
          </TestProtocolLocalization>
        </WritesInFlightProvider>
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

async function readStoredLocation(node: NcNode | undefined) {
  const attribute = node
    ? readEncryptedAttribute(node, 'neighbourhood', variables)
    : undefined;
  if (attribute?.status !== 'encrypted') {
    throw new Error('Expected the location to be stored encrypted');
  }
  const { key } = await encryptionFor('pw');
  return decryptValue(key, attribute.value, attribute.value);
}

describe('Geospatial asking for an encrypted location', () => {
  it('asks for the passphrase instead of taking a location it could not save', async () => {
    const toast = vi.spyOn(interviewToastManager, 'add');
    const { store, selectArea } = await renderGeospatial();
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
    const { store, selectArea } = await renderGeospatial({ unlocked: true });

    await selectArea();

    const stored = await waitFor(() => {
      const [saved] = store.getState().session.network.nodes;
      const attribute = saved
        ? readEncryptedAttribute(saved, 'neighbourhood', variables)
        : undefined;
      if (attribute?.status !== 'encrypted') {
        throw new Error('Expected the location to be stored encrypted');
      }
      return attribute.value;
    });
    expect(stored.nodeId).toBe(person[entityPrimaryKeyProperty]);
    const { key } = await encryptionFor('pw');
    await expect(decryptValue(key, stored, stored)).resolves.toBe('Riverside');
  });
});

describe('Geospatial saving locations in the order they were picked', () => {
  it('stores the later location when the earlier one is still being protected', async () => {
    const { store, selectArea } = await renderGeospatial({ unlocked: true });
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
    // Long enough for a later location that did not wait for the earlier one
    // to be stored first.
    await act(() => new Promise((resolve) => setTimeout(resolve, 500)));
    release();

    await waitFor(() => expect(encryptionGate.begun).toBe(begunBefore + 2));
    await waitFor(() =>
      expect(encryptionGate.ended).toBe(encryptionGate.begun),
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    await expect(
      readStoredLocation(store.getState().session.network.nodes[0]),
    ).resolves.toBe('outside-selectable-areas');
  });

  it('counts a location waiting its turn as being saved until it is stored', async () => {
    const { store, selectArea } = await renderGeospatial({ unlocked: true });
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
    const settling = store.writesSettled();

    release();
    let allStored: boolean | undefined;
    await act(async () => {
      allStored = await settling;
    });
    // Read as soon as the wait is over: the later location is already stored.
    const [saved] = store.getState().session.network.nodes;
    expect(allStored).toBe(true);
    await expect(readStoredLocation(saved)).resolves.toBe(
      'outside-selectable-areas',
    );
  });

  it('counts a location it could not take as not saved', async () => {
    const { store, waitForMap } = await renderGeospatial();
    await waitForMap();

    let settling: Promise<boolean> | undefined;
    act(() => {
      fireEvent.click(screen.getByTestId('outside-selectable-areas-button'));
      settling = store.writesSettled();
    });

    await expect(settling).resolves.toBe(false);
    expect(store.getState().ui.showPassphrasePrompter).toBe(true);
  });
});
