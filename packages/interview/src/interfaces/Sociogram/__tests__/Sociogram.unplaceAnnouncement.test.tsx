import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { DndStoreProvider } from '@codaco/fresco-ui/dnd/dnd';
import { asEntityAttributeReference } from '@codaco/protocol-validation';
import { entityAttributesProperty, type NcNode } from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import { ContractProvider } from '../../../contract/context';
import { InterviewI18nProvider } from '../../../i18n/InterviewI18nProvider';
import { setPassphrase } from '../../../store/modules/ui';
import type { StageProps } from '../../../types';
import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';
import {
  createEncryptionStore,
  encryptedVariables,
  makeEncryptedPerson,
  NODE_TYPE,
} from '../../Anonymisation/__tests__/encryptionFixtures';
import {
  LABEL_PASSPHRASE,
  labelStates,
  liveRegionTexts,
} from '../../Anonymisation/__tests__/labelStates';
import Sociogram from '../Sociogram';

// Holds every decryption under way while set, so a label can be caught
// decrypting.
const decryption = vi.hoisted(() => ({ hold: false }));
vi.mock('../../Anonymisation/utils', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../Anonymisation/utils')>();
  return {
    ...actual,
    decryptData: (...args: Parameters<typeof actual.decryptData>) =>
      decryption.hold
        ? new Promise<string>(() => undefined)
        : actual.decryptData(...args),
  };
});

// jsdom has neither observer; the canvas and the drawer use them.
class StubObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', StubObserver);
  vi.stubGlobal('IntersectionObserver', StubObserver);
});

afterEach(() => {
  decryption.hold = false;
});

const LAYOUT = 'layout';

const variables = {
  ...encryptedVariables,
  [LAYOUT]: { name: 'Layout', label: 'Layout', type: 'layout' as const },
};

const stage: StageProps<'Sociogram'>['stage'] = {
  id: 'sociogram',
  type: 'Sociogram',
  label: { en: 'Place people' },
  subject: { entity: 'node', type: NODE_TYPE },
  background: { concentricCircles: 3, skewedTowardCenter: false },
  prompts: [
    {
      id: 'prompt-1',
      text: { en: 'Place everyone' },
      layout: { layoutVariable: asEntityAttributeReference(LAYOUT) },
    },
  ],
};

const placed = (node: NcNode): NcNode => ({
  ...node,
  [entityAttributesProperty]: {
    ...node[entityAttributesProperty],
    [LAYOUT]: { x: 0.5, y: 0.5 },
  },
});

function renderSociogram(node: NcNode, passphrase?: string) {
  const store = createEncryptionStore([placed(node)], [stage], variables);
  if (passphrase) store.dispatch(setPassphrase(passphrase));

  render(
    <InterviewI18nProvider requestedLocale="en">
      <ContractProvider
        onFinish={vi.fn()}
        onRequestAsset={() => Promise.resolve('')}
      >
        <Provider store={store}>
          <TestProtocolLocalization>
            <CurrentStepProvider currentStep={0} onStepChange={vi.fn()}>
              <DndStoreProvider>
                <Sociogram
                  stage={stage}
                  getNavigationHelpers={() => ({
                    moveForward: () => {},
                    moveBackward: () => {},
                  })}
                />
              </DndStoreProvider>
            </CurrentStepProvider>
          </TestProtocolLocalization>
        </Provider>
      </ContractProvider>
    </InterviewI18nProvider>,
  );
  return store;
}

/**
 * Unplaces the node the canvas shows as `label`, from the keyboard, and
 * returns its accessible name on the canvas and what was announced.
 */
async function unplace(label: string) {
  const node = await screen.findByRole('button', { name: label });
  const shown = node.getAttribute('aria-label');

  act(() => {
    node.focus();
    fireEvent.keyDown(node, { key: 'Delete' });
  });

  return { shown, announced: liveRegionTexts() };
}

describe('Sociogram announcing a node returned to the drawer', () => {
  it.each(labelStates)(
    'names $state by the label the canvas shows',
    async ({ shows, passphrase, holdDecryption, makeNode }) => {
      decryption.hold = holdDecryption ?? false;
      renderSociogram(await makeNode('n1'), passphrase);

      const { shown, announced } = await unplace(shows);

      expect(shown).toBe(shows);
      expect(announced).toContain(`${shown} returned to the drawer.`);
    },
  );

  it('names the label as it is shown when the node is unplaced', async () => {
    const store = renderSociogram(
      await makeEncryptedPerson('n1', 'Alice', LABEL_PASSPHRASE),
    );
    await screen.findByRole('button', { name: '🔒' });

    // The passphrase is entered after the stage opened.
    act(() => {
      store.dispatch(setPassphrase(LABEL_PASSPHRASE));
    });
    const { shown, announced } = await unplace('Alice');

    expect(announced).toContain(`${shown} returned to the drawer.`);
  });
});
