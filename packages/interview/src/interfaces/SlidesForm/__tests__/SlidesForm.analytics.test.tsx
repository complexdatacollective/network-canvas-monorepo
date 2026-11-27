import { configureStore } from '@reduxjs/toolkit';
import { act, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import {
  asEntityAttributeReference,
  type TitlelessForm,
} from '@codaco/protocol-validation';
import { formOf } from '@codaco/protocol-validation/testing';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { testId, testTypeId, testVariableId } from '../../../__tests__/testIds';
import { AnalyticsContext } from '../../../analytics/AnalyticsContext';
import type { Tracker } from '../../../analytics/tracker';
import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import { StageMetadataProvider } from '../../../contexts/StageMetadataContext';
import useInterviewNavigation from '../../../hooks/useInterviewNavigation';
import protocol from '../../../store/modules/protocol';
import session from '../../../store/modules/session';
import ui from '../../../store/modules/ui';
import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';
import SlidesForm from '../SlidesForm';

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

const PERSON_TYPE = testTypeId('person');
const NAME_VAR = testVariableId('name');
const MET_ON_VAR = testVariableId('met_on');

const form: TitlelessForm = formOf([
  {
    id: testId('field-1'),
    variable: asEntityAttributeReference(NAME_VAR),
    prompt: { en: 'Person name' },
  },
  {
    id: testId('field-2'),
    variable: asEntityAttributeReference(MET_ON_VAR),
    prompt: { en: 'When you met' },
  },
]);

const person: NcNode = {
  [entityPrimaryKeyProperty]: 'person-1',
  type: PERSON_TYPE,
  [entityAttributesProperty]: { [NAME_VAR]: 'Ada' },
};

const personVariables = {
  [NAME_VAR]: {
    name: 'Name',
    type: 'text',
    component: 'Text',
  },
  [MET_ON_VAR]: {
    name: 'Met on',
    type: 'datetime',
    component: 'DatePicker',
    parameters: { type: 'full' },
  },
};

const personType = {
  name: 'Person',
  color: 'node-color-seq-1',
  shape: { default: 'circle' },
  variables: personVariables,
};

const codebook = {
  node: { [PERSON_TYPE]: personType },
  edge: {},
  ego: { variables: {} },
};

const requiredNameCodebook = {
  ...codebook,
  node: {
    [PERSON_TYPE]: {
      ...personType,
      variables: {
        ...personVariables,
        [NAME_VAR]: {
          name: 'Name',
          type: 'text',
          component: 'Text',
          validation: { required: true },
        },
      },
    },
  },
};

const namelessPerson: NcNode = {
  [entityPrimaryKeyProperty]: 'person-2',
  type: PERSON_TYPE,
  [entityAttributesProperty]: { [NAME_VAR]: '' },
};

const renderSlidesForm = () => {
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
            subject: { entity: 'node', type: PERSON_TYPE },
            form,
          },
        ],
      } as never,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

  const track = vi.fn();
  const tracker: Tracker = { track, captureException: vi.fn() };

  render(
    <TestProtocolLocalization>
      <Provider store={store}>
        <AnalyticsContext.Provider value={tracker}>
          <CurrentStepProvider currentStep={0} onStepChange={vi.fn()}>
            <DialogProvider>
              <StageMetadataProvider value={vi.fn()}>
                <SlidesForm
                  form={form}
                  items={[person]}
                  subject={{ entity: 'node', type: PERSON_TYPE }}
                  updateItem={vi.fn().mockResolvedValue({ success: true })}
                  moveForward={vi.fn()}
                  renderHeader={() => <span>Person header</span>}
                  form_kind="alter"
                />
              </StageMetadataProvider>
            </DialogProvider>
          </CurrentStepProvider>
        </AnalyticsContext.Provider>
      </Provider>
    </TestProtocolLocalization>,
  );

  return track;
};

// Audit sweep: the shared FormFieldSchema (protocol-validation's
// common/forms.ts) is a strictObject with no `component` key — only
// NetworkComposer fields carry their own control. Testing `'component' in f`
// against a stage field therefore recorded 'unknown' for every field of every
// alter form, always.
describe('SlidesForm analytics', () => {
  it('records each field real input control on form_opened', async () => {
    const track = renderSlidesForm();

    expect(
      await screen.findByRole('textbox', { name: 'Person name' }),
    ).toBeInTheDocument();

    const opened = track.mock.calls.find(([name]) => name === 'form_opened');
    expect(opened).toBeDefined();
    expect(opened?.[1]).toMatchObject({
      form_kind: 'alter',
      field_details: ['Text', 'DatePicker'],
    });
  });

  it('records the real input control on form_validation_failed', async () => {
    const store = configureStore({
      reducer: { session, protocol, ui },
      preloadedState: {
        session: {
          id: 'session',
          network: {
            ego: { [entityAttributesProperty]: {} },
            nodes: [namelessPerson],
            edges: [],
          },
        } as never,
        protocol: {
          id: 'protocol',
          hash: 'hash',
          schemaVersion: 9,
          localization: { defaultLocale: 'en', locales: ['en'] },
          codebook: requiredNameCodebook,
          stages: [
            {
              id: 'alter-form',
              type: 'AlterForm',
              label: { en: 'Alter form' },
              subject: { entity: 'node', type: PERSON_TYPE },
              form,
            },
            {
              id: 'next-screen',
              type: 'Information',
              label: { en: 'Next screen' },
              content: { en: '# Next screen' },
            },
          ],
        } as never,
      },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({ serializableCheck: false }),
    });

    const track = vi.fn();
    const tracker: Tracker = { track, captureException: vi.fn() };
    let moveForward: (() => Promise<void>) | undefined;

    function Harness() {
      const navigation = useInterviewNavigation(0);
      moveForward = navigation.moveForward;

      return (
        <StageMetadataProvider value={navigation.registerBeforeNext}>
          <SlidesForm
            form={form}
            items={[namelessPerson]}
            subject={{ entity: 'node', type: PERSON_TYPE }}
            updateItem={vi.fn().mockResolvedValue({ success: true })}
            moveForward={navigation.moveForward}
            renderHeader={() => <span>Person header</span>}
            form_kind="alter"
          />
        </StageMetadataProvider>
      );
    }

    render(
      <TestProtocolLocalization>
        <Provider store={store}>
          <AnalyticsContext.Provider value={tracker}>
            <CurrentStepProvider currentStep={0} onStepChange={vi.fn()}>
              <DialogProvider>
                <Harness />
              </DialogProvider>
            </CurrentStepProvider>
          </AnalyticsContext.Provider>
        </Provider>
      </TestProtocolLocalization>,
    );

    expect(
      await screen.findByRole('textbox', { name: 'Person name' }),
    ).toHaveValue('');

    await act(async () => {
      await moveForward?.();
    });

    const failed = track.mock.calls.find(
      ([name]) => name === 'form_validation_failed',
    );
    expect(failed).toBeDefined();
    expect(failed?.[1]).toMatchObject({
      form_kind: 'alter',
      field_errors: [
        expect.objectContaining({ field_index: 0, component: 'Text' }),
      ],
    });
  });
});
