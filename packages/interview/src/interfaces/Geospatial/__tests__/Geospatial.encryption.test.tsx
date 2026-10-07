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
