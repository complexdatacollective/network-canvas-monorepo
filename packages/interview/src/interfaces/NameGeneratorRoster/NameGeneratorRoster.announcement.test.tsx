import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { useDragAndDrop } from '@codaco/fresco-ui/collection/dnd/useDragAndDrop';
import { DndStoreProvider } from '@codaco/fresco-ui/dnd/dnd';

import { CurrentStepProvider } from '../../contexts/CurrentStepContext';
import { InterviewI18nProvider } from '../../i18n/InterviewI18nProvider';
import type { StageProps } from '../../types';
import {
  createEncryptionStore,
  NODE_TYPE,
} from '../Anonymisation/__tests__/encryptionFixtures';
import { liveRegionTexts } from '../Anonymisation/__tests__/labelStates';
import NameGeneratorRoster from './NameGeneratorRoster';
import type { UseItemElement } from './useItems';

const { rosterPeople } = vi.hoisted(() => ({
  rosterPeople: [
    {
      _uid: 'roster-alice',
      type: 'person',
      attributes: { name: 'Alice', age: 40 },
    },
  ],
}));

type DragAndDropHooks = ReturnType<typeof useDragAndDrop>['dragAndDropHooks'];

vi.mock('../../hooks/useExternalData', () => ({
  default: () => ({ externalData: rosterPeople, status: { state: 'ready' } }),
}));

// The roster's virtualised cards do not lay out in jsdom. Each item is
// rendered here through the roster's own drag hooks instead, named by its
// card's label as the card is, so a keyboard drag announces what the roster
// hands those hooks.
function RosterCard({
  item,
  hooks,
}: {
  item: UseItemElement;
  hooks: DragAndDropHooks;
}) {
  const { 'aria-label': _dragName, ...dragProps } =
    hooks.useDraggableItemProps?.(item.id) ?? {};
  return <button type="button" {...dragProps} aria-label={item.props.label} />;
}

vi.mock('@codaco/fresco-ui/collection/components/Collection', () => ({
  Collection: (props: {
    items: UseItemElement[];
    dragAndDropHooks: DragAndDropHooks;
  }) => (
    <>
      {props.items.map((item) => (
        <RosterCard key={item.id} item={item} hooks={props.dragAndDropHooks} />
      ))}
    </>
  ),
}));

vi.mock('../../components/NodeList', () => ({ default: () => null }));

class StubObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', StubObserver);
  vi.stubGlobal('IntersectionObserver', StubObserver);
});

const stage: StageProps<'NameGeneratorRoster'>['stage'] = {
  id: 'roster-stage',
  type: 'NameGeneratorRoster',
  label: 'Roster',
  subject: { entity: 'node', type: NODE_TYPE },
  dataSource: 'roster-data',
  prompts: [{ id: 'prompt-1', text: 'Who do you know?' }],
};

describe('NameGeneratorRoster announcing a keyboard drag', () => {
  it('names the person by the label their card shows', async () => {
    const store = createEncryptionStore([], [stage], undefined, {
      encryptionEnabled: false,
    });
    render(
      <InterviewI18nProvider requestedLocale="en">
        <Provider store={store}>
          <CurrentStepProvider currentStep={0} onStepChange={vi.fn()}>
            <DndStoreProvider>
              <NameGeneratorRoster
                stage={stage}
                getNavigationHelpers={() => ({
                  moveForward: () => {},
                  moveBackward: () => {},
                })}
              />
            </DndStoreProvider>
          </CurrentStepProvider>
        </Provider>
      </InterviewI18nProvider>,
    );

    const card = await screen.findByRole('button', { name: 'Alice' });
    const shown = card.getAttribute('aria-label');
    // The drag source's live region is made by an effect.
    await act(async () => {});

    act(() => {
      card.focus();
      fireEvent.keyDown(card, { key: 'd', ctrlKey: true });
    });

    expect(liveRegionTexts()).toContain(
      `${shown} grabbed, use arrow keys to navigate to drop targets, press Escape to cancel`,
    );
  });
});
