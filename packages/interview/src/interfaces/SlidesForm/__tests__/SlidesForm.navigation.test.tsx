import { configureStore } from '@reduxjs/toolkit';
import { act, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

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
import ui from '../../../store/modules/ui';
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
});

const form: TitlelessForm = {
  fields: [{ variable: 'name' as never, prompt: 'Person name' }],
};

const person: NcNode = {
  [entityPrimaryKeyProperty]: 'person-1',
  type: 'person',
  [entityAttributesProperty]: { name: 'Ada' },
};

describe('SlidesForm navigation ownership', () => {
  it('keeps rendered form content on an unavailable stage with an initial override', async () => {
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
          schemaVersion: 8,
          codebook: {
            node: {
              person: {
                name: 'Person',
                color: 'node-color-seq-1',
                shape: { default: 'circle' },
                variables: {
                  name: {
                    name: 'Name',
                    type: 'text',
                    component: 'Text',
                  },
                },
              },
            },
            edge: {},
            ego: { variables: {} },
          },
          stages: [
            {
              id: 'hidden-alter-form',
              type: 'AlterForm',
              label: 'Hidden form',
              subject: { entity: 'node', type: 'person' },
              introductionPanel: { title: 'About this person', text: '' },
              form,
              skipLogic: {
                action: 'SKIP',
                filter: { join: 'AND', rules: [] },
              },
            },
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
    const onStepChange = vi.fn();

    function OverrideHarness() {
      const navigation = useInterviewNavigation(0);

      return (
        <StageMetadataProvider value={navigation.registerBeforeNext}>
          {navigation.canRenderStage && (
            <div data-testid="overridden-slides-form">
              <SlidesForm
                form={form}
                items={[person]}
                subject={{ entity: 'node', type: 'person' }}
                updateItem={vi.fn()}
                moveForward={navigation.moveForward}
                renderHeader={() => <span>Person header</span>}
                form_kind="alter"
              />
            </div>
          )}
        </StageMetadataProvider>
      );
    }

    render(
      <Provider store={store}>
        <CurrentStepProvider currentStep={0} onStepChange={onStepChange}>
          <DialogProvider>
            <OverrideHarness />
          </DialogProvider>
        </CurrentStepProvider>
      </Provider>,
    );

    expect(screen.getByTestId('overridden-slides-form')).toBeVisible();
    expect(
      await screen.findByRole('textbox', { name: 'Person name' }),
    ).toBeInTheDocument();

    await act(() => Promise.resolve());
    expect(onStepChange).not.toHaveBeenCalled();
  });
});
