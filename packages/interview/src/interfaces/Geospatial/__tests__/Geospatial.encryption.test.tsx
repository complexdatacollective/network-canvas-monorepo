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

  const selectArea = async () => {
    const map = screen.getByTestId('map-container');
    await waitFor(() => expect(map).toHaveAttribute('data-map-idle', 'true'));
    act(() => {
      fireEvent.click(screen.getByTestId('geospatial-stub-click-area'));
    });
  };

  return { store, selectArea };
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
