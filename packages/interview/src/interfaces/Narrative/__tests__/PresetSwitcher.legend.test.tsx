import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { cleanup, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { testId, testTypeId, testVariableId } from '../../../__tests__/testIds';

// Most tests here give the switcher an empty network; the group legend tests
// read a real store.
const selectorMode = vi.hoisted(() => ({ real: false }));
vi.mock('../../../hooks/useStageSelector', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../hooks/useStageSelector')>();
  return {
    useStageSelector: <T,>(
      selector: Parameters<typeof actual.useStageSelector<T>>[0],
    ) =>
      selectorMode.real
        ? actual.useStageSelector(selector)
        : { categoricalOptions: undefined, groupValues: [], edges: [] },
  };
});

import {
  asEntityAttributeReference,
  type Stage,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import { createInitialNetwork } from '../../../contract/network';
import type { ProtocolPayload } from '../../../contract/types';
import protocol from '../../../store/modules/protocol';
import session from '../../../store/modules/session';
import ui from '../../../store/modules/ui';
import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';
import PresetSwitcher from '../PresetSwitcher';

const HEADINGS = {
  attributes: 'Attributes',
  links: 'Links',
  groups: undefined,
};

const PRESETS: React.ComponentProps<typeof PresetSwitcher>['presets'] = [
  {
    id: testId('preset'),
    label: { en: 'Friends', ar: 'الأصدقاء' },
    layout: 'layout',
    highlight: [
      {
        id: testId('highlight-close'),
        label: { en: 'Close friend', ar: 'صديق مقرب' },
        attributes: [
          {
            id: testId('highlight-close-person'),
            type: 'person',
            variable: asEntityAttributeReference('close'),
          },
        ],
      },
      {
        id: testId('highlight-trusted'),
        label: { en: 'Trusted' },
        attributes: [
          {
            id: testId('highlight-trusted-person'),
            type: 'person',
            variable: asEntityAttributeReference('trusted'),
          },
        ],
      },
    ],
  },
];

// The interview sets one language for everything it renders, so a label names
// none of its own, nor does any wrapper between it and the switcher.
const marksOwnLanguage = (text: string) =>
  screen.getByText(text).closest('[lang], [dir]') !== null;

afterEach(() => {
  cleanup();
  selectorMode.real = false;
});

describe('PresetSwitcher highlight legend', () => {
  it("names each highlight with the preset's own label, in the interview language or the default", () => {
    render(
      <PresetSwitcher
        presets={PRESETS}
        headings={HEADINGS}
        activePreset={0}
        highlightIndex={0}
        showHighlighting
        showEdges={false}
        showHulls={false}
        onChangePreset={vi.fn()}
        onToggleHulls={vi.fn()}
        onToggleEdges={vi.fn()}
        onChangeHighlightIndex={vi.fn()}
        onToggleHighlighting={vi.fn()}
        dragConstraints={{ current: null }}
      />,
      {
        wrapper: ({ children }) => (
          <TestProtocolLocalization
            localization={{ defaultLocale: 'en', locales: ['en', 'ar'] }}
            locale="ar"
          >
            {children}
          </TestProtocolLocalization>
        ),
      },
    );

    expect(
      screen.getByRole('radio', { name: 'صديق مقرب' }),
    ).toBeInTheDocument();
    expect(marksOwnLanguage('صديق مقرب')).toBe(false);
    expect(screen.getByRole('radio', { name: 'Trusted' })).toBeInTheDocument();
    expect(marksOwnLanguage('Trusted')).toBe(false);
  });
});

describe('PresetSwitcher without a legend', () => {
  it('opens no legend for a preset that only names a layout', () => {
    const [preset] = PRESETS;
    if (preset === undefined) throw new Error('No preset fixture.');
    render(
      <PresetSwitcher
        presets={[{ ...preset, highlight: [] }]}
        headings={HEADINGS}
        activePreset={0}
        highlightIndex={0}
        showHighlighting={false}
        showEdges={false}
        showHulls={false}
        onChangePreset={vi.fn()}
        onToggleHulls={vi.fn()}
        onToggleEdges={vi.fn()}
        onChangeHighlightIndex={vi.fn()}
        onToggleHighlighting={vi.fn()}
        dragConstraints={{ current: null }}
      />,
      {
        wrapper: ({ children }) => (
          <TestProtocolLocalization
            localization={{ defaultLocale: 'en', locales: ['en'] }}
            locale="en"
          >
            {children}
          </TestProtocolLocalization>
        ),
      },
    );

    expect(screen.getByText('Friends')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Friends' })).not.toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });
});

describe('PresetSwitcher group legend', () => {
  const PERSON = testTypeId('person');
  const PLACE = testTypeId('place');
  const CIRCLE = testVariableId('circle');
  const LAYOUT = testId('layout');
  const groupPreset = {
    id: testId('group-preset'),
    label: { en: 'Circles' },
    layout: LAYOUT,
    groupVariable: asEntityAttributeReference(CIRCLE),
  };

  const renderWithTypes = (types: string[]) => {
    selectorMode.real = true;
    const stage = {
      id: testId('narrative'),
      type: 'Narrative',
      label: { en: 'Narrative' },
      subject: { entity: 'node', types },
      presets: [groupPreset],
      background: { concentricCircles: 3 },
    } satisfies Stage;
    const protocolState: ProtocolPayload = {
      id: 'p',
      hash: 'h',
      importedAt: '2026-11-27T00:00:00.000Z',
      assets: [],
      name: 'Test protocol',
      schemaVersion: 9,
      localization: { defaultLocale: 'en', locales: ['en'] },
      codebook: {
        node: {
          [PERSON]: {
            name: 'Person',
            color: 'node-color-seq-1',
            shape: { default: 'circle' },
            variables: {
              [CIRCLE]: {
                name: 'circle',
                type: 'categorical',
                options: [
                  {
                    id: testId('work'),
                    value: 'work',
                    label: { en: 'Work friends' },
                  },
                ],
              },
            },
          },
          [PLACE]: {
            name: 'Place',
            color: 'node-color-seq-2',
            shape: { default: 'square' },
            variables: {},
          },
        },
        edge: {},
        layouts: { [LAYOUT]: { name: 'map' } },
        ego: { variables: {} },
      },
      stages: [stage],
    };
    const store = configureStore({
      reducer: combineReducers({ session, protocol, ui }),
      preloadedState: {
        session: {
          id: 's',
          startTime: '2026-11-27T00:00:00.000Z',
          finishTime: null,
          exportTime: null,
          lastUpdated: '2026-11-27T00:00:00.000Z',
          promptIndex: 0,
          network: {
            ...createInitialNetwork(),
            nodes: [
              {
                [entityPrimaryKeyProperty]: 'alex',
                type: PERSON,
                [entityAttributesProperty]: { [CIRCLE]: ['work'] },
              },
            ],
          },
        },
        protocol: protocolState,
      },
      middleware: (g) => g({ serializableCheck: false }),
    });
    render(
      <PresetSwitcher
        presets={[groupPreset]}
        headings={{ ...HEADINGS, groups: 'Groups' }}
        activePreset={0}
        highlightIndex={0}
        showHighlighting={false}
        showEdges={false}
        showHulls
        onChangePreset={vi.fn()}
        onToggleHulls={vi.fn()}
        onToggleEdges={vi.fn()}
        onChangeHighlightIndex={vi.fn()}
        onToggleHighlighting={vi.fn()}
        dragConstraints={{ current: null }}
      />,
      {
        wrapper: ({ children }) => (
          <Provider store={store}>
            <CurrentStepProvider currentStep={0} onStepChange={() => undefined}>
              <TestProtocolLocalization
                localization={{ defaultLocale: 'en', locales: ['en'] }}
                locale="en"
              >
                {children}
              </TestProtocolLocalization>
            </CurrentStepProvider>
          </Provider>
        ),
      },
    );
  };

  it('shows groups with one type', () => {
    renderWithTypes([PERSON]);

    expect(screen.getByText('Work friends')).toBeInTheDocument();
  });

  it('hides groups with two types', () => {
    renderWithTypes([PERSON, PLACE]);

    expect(screen.getByText('Circles')).toBeInTheDocument();
    expect(screen.queryByText('Groups')).toBeNull();
    expect(screen.queryByText('Work friends')).toBeNull();
  });
});
