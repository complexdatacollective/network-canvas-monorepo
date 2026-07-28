import { configureStore } from '@reduxjs/toolkit';
import { act, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { AnalyticsContext } from '../../../analytics/AnalyticsContext';
import type { Tracker } from '../../../analytics/tracker';
import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import { StageMetadataProvider } from '../../../contexts/StageMetadataContext';
import useInterviewNavigation from '../../../hooks/useInterviewNavigation';
import protocol from '../../../store/modules/protocol';
import session from '../../../store/modules/session';
import ui from '../../../store/modules/ui';
import type { StageProps } from '../../../types';
import EgoForm from '../EgoForm';

class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class ImmediateIntersectionObserver {
  private callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    this.callback(
      [{ isIntersecting: true, target } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }

  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds = [];
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
  vi.stubGlobal('IntersectionObserver', ImmediateIntersectionObserver);
  // jsdom implements no scrolling, and the validation-failure path scrolls the
  // first error into view once the event has been tracked.
  Element.prototype.scrollTo = () => {};
});

const stage = {
  id: 'ego-form',
  type: 'EgoForm',
  label: 'About you',
  introductionPanel: { title: 'About you', text: '' },
  form: {
    fields: [
      { variable: 'nickname', prompt: 'Your nickname' },
      { variable: 'born_on', prompt: 'Your date of birth' },
    ],
  },
} as unknown as StageProps<'EgoForm'>['stage'];

const codebook = {
  node: {},
  edge: {},
  ego: {
    variables: {
      nickname: { name: 'Nickname', type: 'text', component: 'Text' },
      born_on: {
        name: 'Born on',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'full' },
      },
    },
  },
};

const requiredNicknameCodebook = {
  ...codebook,
  ego: {
    variables: {
      ...codebook.ego.variables,
      nickname: {
        name: 'Nickname',
        type: 'text',
        component: 'Text',
        validation: { required: true },
      },
    },
  },
};

const renderEgoForm = (
  bookOfCodes: typeof codebook = codebook,
  onMoveForward?: (moveForward: () => Promise<void>) => void,
) => {
  const store = configureStore({
    reducer: { session, protocol, ui },
    preloadedState: {
      session: {
        id: 'session',
        network: {
          ego: { [entityAttributesProperty]: {} },
          nodes: [],
          edges: [],
        },
      } as never,
      protocol: {
        id: 'protocol',
        hash: 'hash',
        schemaVersion: 8,
        codebook: bookOfCodes,
        stages: [
          stage,
          {
            id: 'next-screen',
            type: 'Information',
            label: 'Next screen',
            title: 'Next screen',
            items: [],
          },
        ],
      } as never,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

  const track = vi.fn();
  const tracker: Tracker = { track, captureException: vi.fn() };

  function Harness() {
    const navigation = useInterviewNavigation(0);
    onMoveForward?.(navigation.moveForward);

    return (
      <StageMetadataProvider value={navigation.registerBeforeNext}>
        <EgoForm
          stage={stage}
          getNavigationHelpers={() => ({
            moveForward: navigation.moveForward,
            moveBackward: vi.fn(),
          })}
        />
      </StageMetadataProvider>
    );
  }

  render(
    <Provider store={store}>
      <AnalyticsContext.Provider value={tracker}>
        <CurrentStepProvider currentStep={0} onStepChange={vi.fn()}>
          <DialogProvider>
            <Harness />
          </DialogProvider>
        </CurrentStepProvider>
      </AnalyticsContext.Provider>
    </Provider>,
  );

  return track;
};

// Audit sweep: the shared FormFieldSchema (protocol-validation's
// common/forms.ts) is a strictObject with no `component` key — only
// NetworkComposer fields carry their own control. Testing `'component' in f`
// against a stage field therefore recorded 'unknown' for every field of every
// EgoForm, always. The control comes from the codebook entry, exactly as the
// rendered Field resolves it.
describe('EgoForm analytics', () => {
  it('records each field real input control on form_opened', async () => {
    const track = renderEgoForm();

    expect(await screen.findByLabelText(/Your nickname/)).toBeInTheDocument();

    const opened = track.mock.calls.find(([name]) => name === 'form_opened');
    expect(opened).toBeDefined();
    expect(opened?.[1]).toMatchObject({
      form_kind: 'ego',
      field_details: ['Text', 'DatePicker'],
    });
  });

  it('records the real input control on form_validation_failed', async () => {
    let moveForward: (() => Promise<void>) | undefined;
    const track = renderEgoForm(requiredNicknameCodebook, (forward) => {
      moveForward = forward;
    });

    expect(await screen.findByLabelText(/Your nickname/)).toHaveValue('');

    await act(async () => {
      await moveForward?.();
    });

    const failed = track.mock.calls.find(
      ([name]) => name === 'form_validation_failed',
    );
    expect(failed).toBeDefined();
    expect(failed?.[1]).toMatchObject({
      form_kind: 'ego',
      field_errors: [
        expect.objectContaining({ field_index: 0, component: 'Text' }),
      ],
    });
  });
});
