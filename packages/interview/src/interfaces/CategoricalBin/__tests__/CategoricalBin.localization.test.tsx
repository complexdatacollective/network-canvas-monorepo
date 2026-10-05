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
            label: { en: 'Category', ar: 'فئة' },
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

const languageOf = (text: string) => {
  const tagged = screen.getByText(text).closest('[lang]');
  return {
    lang: tagged?.getAttribute('lang'),
    dir: tagged?.getAttribute('dir'),
  };
};

describe('CategoricalBin bin labels', () => {
  it('renders a translated option label right-to-left in the interview locale', () => {
    renderInArabic();

    expect(languageOf('العائلة')).toEqual({ lang: 'ar', dir: 'rtl' });
  });

  it('tags an untranslated option label with the default locale it fell back to', () => {
    renderInArabic();

    expect(languageOf('Friends')).toEqual({ lang: 'en', dir: 'ltr' });
  });
});
