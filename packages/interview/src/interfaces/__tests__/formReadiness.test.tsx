import { configureStore } from '@reduxjs/toolkit';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { Provider } from 'react-redux';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../contexts/CurrentStepContext';
import { StageMetadataProvider } from '../../contexts/StageMetadataContext';
import useInterviewNavigation from '../../hooks/useInterviewNavigation';
import protocol from '../../store/modules/protocol';
import session from '../../store/modules/session';
import ui, { formIsReady } from '../../store/modules/ui';
import type { StageProps } from '../../types';
import AlterEdgeForm from '../AlterEdgeForm/AlterEdgeForm';
import AlterForm from '../AlterForm/AlterForm';
import EgoForm from '../EgoForm/EgoForm';
import { TestProtocolLocalization } from './TestProtocolLocalization';

// jsdom lays nothing out, so every scroll container already sits "at the
// bottom". Whether the form has been scrolled to its end is controlled here.
const scroll = vi.hoisted(() => ({ atBottom: false }));

vi.mock('../../hooks/useScrolledToBottom', () => ({
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

// One required question and one optional one, on every kind of form.
const variables = {
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
};

const form = {
  fields: [
    { variable: 'name', prompt: { en: 'Name' } },
    { variable: 'nickname', prompt: { en: 'Nickname' } },
  ],
};

const nodeType = {
  name: 'Person',
  label: { en: 'Person' },
  color: 'node-color-seq-1',
  shape: { default: 'circle' },
};

const codebook = {
  node: { person: { ...nodeType, variables } },
  edge: { friend: { name: 'Friend', color: 'edge-color-seq-1', variables } },
  ego: { variables },
};

type Kind = 'alter' | 'alter edge' | 'ego';

const stageFor = (kind: Kind) => {
  switch (kind) {
    case 'alter':
      return {
        id: 'stage',
        type: 'AlterForm',
        label: { en: 'Form' },
        subject: { entity: 'node', type: 'person' },
        form,
      };
    case 'alter edge':
      return {
        id: 'stage',
        type: 'AlterEdgeForm',
        label: { en: 'Form' },
        subject: { entity: 'edge', type: 'friend' },
        form,
      };
    case 'ego':
      return {
        id: 'stage',
        type: 'EgoForm',
        label: { en: 'Form' },
        form: { ...form, title: { en: 'About you' } },
      };
  }
};

function renderForm(kind: Kind, answers: Record<string, string>) {
  const plainNode = (id: string) => ({
    [entityPrimaryKeyProperty]: id,
    type: 'person',
    [entityAttributesProperty]: kind === 'alter' ? answers : { name: id },
  });
  const network = {
    ego: { [entityAttributesProperty]: kind === 'ego' ? answers : {} },
    nodes: [plainNode('a'), plainNode('b')],
    edges:
      kind === 'alter edge'
        ? [
            {
              [entityPrimaryKeyProperty]: 'edge-1',
              type: 'friend',
              from: 'a',
              to: 'b',
              [entityAttributesProperty]: answers,
            },
          ]
        : [],
  };
  const stage = stageFor(kind);
  const store = configureStore({
    reducer: { session, protocol, ui },
    preloadedState: {
      session: { id: 'session', network } as never,
      protocol: {
        id: 'protocol',
        hash: 'hash',
        schemaVersion: 9,
        localization: { defaultLocale: 'en', locales: ['en'] },
        codebook,
        stages: [stage],
      } as never,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

  function Harness() {
    const navigation = useInterviewNavigation(0);
    const props = {
      stage,
      getNavigationHelpers: () => ({
        moveForward: navigation.moveForward,
        moveBackward: vi.fn(),
      }),
    } as never;
    let element: ReactElement;
    if (kind === 'alter')
      element = <AlterForm {...(props as StageProps<'AlterForm'>)} />;
    else if (kind === 'alter edge')
      element = <AlterEdgeForm {...(props as StageProps<'AlterEdgeForm'>)} />;
    else element = <EgoForm {...(props as StageProps<'EgoForm'>)} />;

    return (
      <StageMetadataProvider value={navigation.registerBeforeNext}>
        {element}
      </StageMetadataProvider>
    );
  }

  const tree = () => (
    <TestProtocolLocalization>
      <Provider store={store}>
        <CurrentStepProvider currentStep={0} onStepChange={vi.fn()}>
          <DialogProvider>
            <Harness />
          </DialogProvider>
        </CurrentStepProvider>
      </Provider>
    </TestProtocolLocalization>
  );
  const view = render(tree());

  return {
    isReady: () => formIsReady(store.getState() as never),
    rerender: () => view.rerender(tree()),
  };
}

describe.each<Kind>(['alter', 'alter edge', 'ego'])(
  'Next readiness on the %s form',
  (kind) => {
    it('is not ready while an optional question is unanswered and unseen', async () => {
      const { isReady } = renderForm(kind, { name: 'Ada' });
      await screen.findByRole('textbox', { name: 'Nickname' });
      await act(() => Promise.resolve());

      expect(isReady()).toBe(false);
    });

    it('is ready once every question is answered, without scrolling or leaving the last question', async () => {
      const { isReady } = renderForm(kind, { name: 'Ada' });
      const nickname = await screen.findByRole('textbox', {
        name: 'Nickname',
      });

      await act(async () => {
        fireEvent.change(nickname, { target: { value: 'Countess' } });
      });

      expect(isReady()).toBe(true);
    });

    it('is ready when the required questions are answered and the form has been scrolled to the end', async () => {
      const { isReady, rerender } = renderForm(kind, { name: 'Ada' });
      await screen.findByRole('textbox', { name: 'Nickname' });

      scroll.atBottom = true;
      await act(async () => {
        rerender();
      });

      expect(isReady()).toBe(true);
    });

    it('is not ready at the end of the form while a required question is unanswered', async () => {
      scroll.atBottom = true;
      const { isReady } = renderForm(kind, { nickname: 'Countess' });
      await screen.findByRole('textbox', { name: 'Nickname' });
      await act(() => Promise.resolve());

      expect(isReady()).toBe(false);
    });
  },
);
