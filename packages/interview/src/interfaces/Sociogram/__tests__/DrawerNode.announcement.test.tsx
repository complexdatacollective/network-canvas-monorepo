import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { DndStoreProvider } from '@codaco/fresco-ui/dnd/dnd';
import type { NcNode } from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import { InterviewI18nProvider } from '../../../i18n/InterviewI18nProvider';
import { setPassphrase } from '../../../store/modules/ui';
import { createEncryptionStore } from '../../Anonymisation/__tests__/encryptionFixtures';
import {
  labelStates,
  liveRegionTexts,
} from '../../Anonymisation/__tests__/labelStates';
import DrawerNode from '../DrawerNode';

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

function renderDrawerNode(node: NcNode, passphrase?: string) {
  const store = createEncryptionStore([node]);
  if (passphrase) store.dispatch(setPassphrase(passphrase));

  render(
    <InterviewI18nProvider requestedLocale="en">
      <Provider store={store}>
        <CurrentStepProvider currentStep={0} onStepChange={vi.fn()}>
          <DndStoreProvider>
            <DrawerNode node={node} />
          </DndStoreProvider>
        </CurrentStepProvider>
      </Provider>
    </InterviewI18nProvider>,
  );
}

describe('DrawerNode announcing a keyboard drag', () => {
  it.each(labelStates)(
    'names $state by the label the drawer shows',
    async ({ shows, passphrase, holdDecryption, makeNode }) => {
      decryption.hold = holdDecryption ?? false;
      renderDrawerNode(await makeNode('n1'), passphrase);

      const node = await screen.findByRole('button', { name: shows });
      const shown = node.getAttribute('aria-label');
      expect(shown).toBe(shows);
      // The drag source's live region is made by an effect, which a node that
      // renders without waiting for decryption can be found before.
      await act(async () => {});

      act(() => {
        node.focus();
        fireEvent.keyDown(node, { key: 'd', ctrlKey: true });
      });
      expect(liveRegionTexts()).toContain(
        `${shown} grabbed, use arrow keys to navigate to drop targets, press Escape to cancel`,
      );

      act(() => {
        fireEvent.keyDown(node, { key: 'Escape' });
      });
      expect(liveRegionTexts()).toContain(
        `Drop cancelled, ${shown} returned to original position`,
      );
    },
  );
});
