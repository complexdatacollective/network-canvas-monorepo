import { configureStore } from '@reduxjs/toolkit';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import type { TitlelessForm } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import { StageMetadataProvider } from '../../../contexts/StageMetadataContext';
import useInterviewNavigation from '../../../hooks/useInterviewNavigation';
import protocol from '../../../store/modules/protocol';
import session from '../../../store/modules/session';
import ui, { formIsReady } from '../../../store/modules/ui';
import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';
import SlidesForm from '../SlidesForm';

const scroll = vi.hoisted(() => ({ atBottom: false }));

vi.mock('../../../hooks/useScrolledToBottom', () => ({
  useScrolledToBottom: () => ({
    hasScrolledToBottom: scroll.atBottom,
    sentinelRef: () => undefined,
  }),
}));

class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
});

beforeEach(() => {
  scroll.atBottom = false;
});

const form: TitlelessForm = {
  fields: [
    { variable: 'name' as never, prompt: { en: 'Person name' } },
    { variable: 'nickname' as never, prompt: { en: 'Nickname' } },
  ],
};

const codebook = {
  node: {
    person: {
      name: 'Person',
      label: { en: 'Person' },
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {
        name: {
          name: 'Name',
          label: 'Name',
          type: 'text',
          component: 'Text',
          validation: { required: true },
        },
        nickname: {
          name: 'Nickname',
          label: 'Nickname',
          type: 'text',
          component: 'Text',
        },
      },
    },
  },
  edge: {},
  ego: { variables: {} },
};

const makePerson = (attributes: Record<string, string>): NcNode => ({
  [entityPrimaryKeyProperty]: 'person-1',
  type: 'person',
  [entityAttributesProperty]: attributes,
});

function renderSlidesForm(person: NcNode) {
  const store = configureStore({
    reducer: { session, protocol, ui },
    preloadedState: {
      session: {
        id: 'session',
        network: {
          ego: { [entityAttributesProperty]: {} },
          nodes: [person],
          edges: [],
        },
      } as never,
      protocol: {
        id: 'protocol',
        hash: 'hash',
        schemaVersion: 9,
        localization: { defaultLocale: 'en', locales: ['en'] },
        codebook,
        stages: [
          {
            id: 'alter-form',
            type: 'AlterForm',
            label: { en: 'Alter form' },
            subject: { entity: 'node', type: 'person' },
            form,
          },
        ],
      } as never,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

  function Harness() {
    const navigation = useInterviewNavigation(0);

    return (
      <StageMetadataProvider value={navigation.registerBeforeNext}>
        <SlidesForm
          form={form}
          items={[person]}
          subject={{ entity: 'node', type: 'person' }}
          updateItem={vi.fn().mockResolvedValue({ success: true })}
          moveForward={navigation.moveForward}
          renderHeader={() => <span>Person header</span>}
          form_kind="alter"
        />
      </StageMetadataProvider>
    );
  }

  const view = render(
    <TestProtocolLocalization>
      <Provider store={store}>
        <CurrentStepProvider currentStep={0} onStepChange={vi.fn()}>
          <DialogProvider>
            <Harness />
          </DialogProvider>
        </CurrentStepProvider>
      </Provider>
    </TestProtocolLocalization>,
  );

  return {
    isReady: () => formIsReady(store.getState() as never),
    rerender: () =>
      view.rerender(
        <TestProtocolLocalization>
          <Provider store={store}>
            <CurrentStepProvider currentStep={0} onStepChange={vi.fn()}>
              <DialogProvider>
                <Harness />
              </DialogProvider>
            </CurrentStepProvider>
          </Provider>
        </TestProtocolLocalization>,
      ),
  };
}

describe('SlidesForm readiness for the next step', () => {
  it('is not ready while an optional question is unanswered and unseen', async () => {
    const { isReady } = renderSlidesForm(makePerson({ name: 'Ada' }));
    await screen.findByRole('textbox', { name: 'Nickname' });
    await act(() => Promise.resolve());

    expect(isReady()).toBe(false);
  });

  it('is ready once every question is answered, without scrolling', async () => {
    const { isReady } = renderSlidesForm(makePerson({ name: 'Ada' }));
    const nickname = await screen.findByRole('textbox', { name: 'Nickname' });

    await act(async () => {
      fireEvent.change(nickname, { target: { value: 'Countess' } });
    });

    expect(isReady()).toBe(true);
  });

  it('is ready when the required questions are answered and the form has been scrolled to the end', async () => {
    const { isReady, rerender } = renderSlidesForm(makePerson({ name: 'Ada' }));
    await screen.findByRole('textbox', { name: 'Nickname' });

    scroll.atBottom = true;
    await act(async () => {
      rerender();
    });

    expect(isReady()).toBe(true);
  });

  it('is not ready at the end of the form while a required question is unanswered', async () => {
    scroll.atBottom = true;
    const { isReady } = renderSlidesForm(makePerson({ nickname: 'Countess' }));
    await screen.findByRole('textbox', { name: 'Nickname' });
    await act(() => Promise.resolve());

    expect(isReady()).toBe(false);
  });
});
