import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import { DndStoreProvider } from '@codaco/fresco-ui/dnd/dnd';
import {
  asEntityAttributeReference,
  type LocalizationDeclaration,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import type { ProtocolPayload } from '../../../contract/types';
import protocol from '../../../store/modules/protocol';
import session, { type SessionState } from '../../../store/modules/session';
import ui from '../../../store/modules/ui';
import type { StageProps } from '../../../types';
import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';
import CategoricalBin from '../CategoricalBin';

vi.mock('../../../hooks/useCelebrate', () => ({
  useCelebrate: () => vi.fn(),
}));

vi.mock('../../../analytics/useTrack', () => ({
  useTrack: () => vi.fn(),
  useCaptureException: () => vi.fn(),
}));

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', NoopObserver);
  vi.stubGlobal('IntersectionObserver', NoopObserver);
});

const NODE_TYPE = 'person';
const CATEGORY_VARIABLE = 'category';

const LOCALIZATION: LocalizationDeclaration = {
  defaultLocale: 'en',
  locales: ['en', 'ar'],
};

const stage: StageProps<'CategoricalBin'>['stage'] = {
  id: 'stage',
  type: 'CategoricalBin',
  label: { en: 'Categorise people', ar: 'تصنيف الأشخاص' },
  subject: { entity: 'node', type: NODE_TYPE },
  prompts: [
    {
      id: 'prompt',
      text: { en: 'Which group?', ar: 'أي مجموعة؟' },
      variable: asEntityAttributeReference(CATEGORY_VARIABLE),
    },
  ],
};

const protocolPayload: ProtocolPayload = {
  id: 'protocol',
  hash: 'hash',
  importedAt: '2024-01-01T00:00:00.000Z',
  assets: [],
  name: 'Test protocol',
  schemaVersion: 9,
  localization: { defaultLocale: 'en', locales: ['en', 'ar'] },
  codebook: {
    node: {
      [NODE_TYPE]: {
        name: 'Person',
        label: { en: 'Person', ar: 'شخص' },
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables: {
          [CATEGORY_VARIABLE]: {
            name: 'Category',
            label: 'Category',
            type: 'categorical',
            component: 'CheckboxGroup',
            options: [
              { label: { en: 'Family', ar: 'العائلة' }, value: 'family' },
              // No Arabic translation: the participant sees the default.
              { label: { en: 'Friends' }, value: 'friends' },
            ],
          },
        },
      },
    },
    edge: {},
    ego: { variables: {} },
  },
  stages: [stage],
};

const sessionState: SessionState = {
  id: 'session',
  startTime: '2024-01-01T00:00:00.000Z',
  finishTime: null,
  exportTime: null,
  lastUpdated: '2024-01-01T00:00:00.000Z',
  localePreference: 'ar',
  locale: 'ar',
  network: {
    ego: { [entityPrimaryKeyProperty]: 'ego', [entityAttributesProperty]: {} },
    nodes: [],
    edges: [],
  },
};

function renderInArabic() {
  const store = configureStore({
    reducer: { session, protocol, ui },
    preloadedState: { session: sessionState, protocol: protocolPayload },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

  render(
    <TestProtocolLocalization localization={LOCALIZATION} locale="ar">
      <Provider store={store}>
        <CurrentStepProvider currentStep={0} onStepChange={vi.fn()}>
          <DialogProvider>
            <DndStoreProvider>
              <CategoricalBin
                stage={stage}
                getNavigationHelpers={() => ({
                  moveForward: () => {},
                  moveBackward: () => {},
                })}
              />
            </DndStoreProvider>
          </DialogProvider>
        </CurrentStepProvider>
      </Provider>
    </TestProtocolLocalization>,
  );
}

// The interview sets one language for everything it renders, so a label names
// none of its own, nor does any wrapper between it and the stage.
const marksOwnLanguage = (text: string) =>
  screen.getByText(text).closest('[lang], [dir]') !== null;

describe('CategoricalBin bin labels', () => {
  it('shows a translated option label in the interview language', () => {
    renderInArabic();

    expect(marksOwnLanguage('العائلة')).toBe(false);
  });

  it('shows an untranslated option label in the default language, with no language of its own', () => {
    renderInArabic();

    expect(marksOwnLanguage('Friends')).toBe(false);
  });
});
