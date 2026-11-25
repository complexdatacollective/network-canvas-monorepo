import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import { dynamicValueNameFor } from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { testVariableId } from '../../../__tests__/testIds';
import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import { StageMetadataProvider } from '../../../contexts/StageMetadataContext';
import { StageDynamicValues } from '../../../dynamicValues/DynamicValueScope';
import protocol from '../../../store/modules/protocol';
import session from '../../../store/modules/session';
import ui from '../../../store/modules/ui';
import type { StageProps } from '../../../types';
import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';
import EgoForm from '../EgoForm';

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

const NICKNAME_VARIABLE = testVariableId('nickname');
const NICKNAME = dynamicValueNameFor({
  kind: 'attribute',
  role: 'ego',
  variableId: NICKNAME_VARIABLE,
});

const stage = {
  id: 'ego-form',
  type: 'EgoForm',
  label: { en: 'About you' },
  introductionPanel: {
    title: {
      en: `{${NICKNAME}, select, missing {About you} other {About {${NICKNAME}}}}`,
    },
  },
  form: {
    fields: [
      {
        id: 'field-1',
        variable: NICKNAME_VARIABLE,
        prompt: { en: 'Your nickname' },
      },
    ],
  },
} as unknown as StageProps<'EgoForm'>['stage'];

const renderEgoForm = () => {
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
        schemaVersion: 9,
        localization: { defaultLocale: 'en', locales: ['en'] },
        codebook: {
          node: {},
          edge: {},
          ego: {
            variables: {
              [NICKNAME_VARIABLE]: {
                name: 'Nickname',
                type: 'text',
                component: 'Text',
              },
            },
          },
        },
        stages: [stage],
      } as never,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

  render(
    <TestProtocolLocalization>
      <Provider store={store}>
        <CurrentStepProvider currentStep={0} onStepChange={vi.fn()}>
          <DialogProvider>
            <StageMetadataProvider value={vi.fn()}>
              <StageDynamicValues stage={stage}>
                <EgoForm
                  stage={stage}
                  getNavigationHelpers={() => ({
                    moveForward: vi.fn(),
                    moveBackward: vi.fn(),
                  })}
                />
              </StageDynamicValues>
            </StageMetadataProvider>
          </DialogProvider>
        </CurrentStepProvider>
      </Provider>
    </TestProtocolLocalization>,
  );
};

describe('EgoForm dynamic values', () => {
  it('shows an answer in the title as the participant gives it', async () => {
    renderEgoForm();
    const title = screen.getByRole('heading', { level: 1 });
    expect(title).toHaveTextContent('About you');

    fireEvent.change(await screen.findByLabelText(/Your nickname/), {
      target: { value: 'Ada' },
    });

    const value = screen.getByText('Ada', { selector: 'bdi' });
    expect(title).toContainElement(value);
    expect(value.closest('[data-dynamic-value]')).not.toBeNull();
  });
});
