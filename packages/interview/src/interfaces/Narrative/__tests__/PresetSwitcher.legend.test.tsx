import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../hooks/useStageSelector', () => ({
  useStageSelector: () => ({
    categoricalOptions: undefined,
    groupValues: [],
    edges: [],
  }),
}));

import { asEntityAttributeReference } from '@codaco/protocol-validation';

import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';
import PresetSwitcher from '../PresetSwitcher';

const PRESETS: React.ComponentProps<typeof PresetSwitcher>['presets'] = [
  {
    id: 'preset',
    label: { en: 'Friends', ar: 'الأصدقاء' },
    layoutVariable: asEntityAttributeReference('layout'),
    highlight: [
      {
        variable: asEntityAttributeReference('close'),
        label: { en: 'Close friend', ar: 'صديق مقرب' },
      },
      {
        variable: asEntityAttributeReference('trusted'),
        label: { en: 'Trusted' },
      },
    ],
  },
];

const languageOf = (element: Element | null) => {
  const marked = element?.closest('[lang]');
  return marked
    ? { lang: marked.getAttribute('lang'), dir: marked.getAttribute('dir') }
    : null;
};

afterEach(() => {
  cleanup();
});

describe('PresetSwitcher highlight legend', () => {
  it("names each highlight with the preset's own label, marking text shown in another language", () => {
    render(
      <PresetSwitcher
        presets={PRESETS}
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
    expect(languageOf(screen.getByText('صديق مقرب'))).toEqual({
      lang: 'ar',
      dir: 'rtl',
    });
    expect(screen.getByRole('radio', { name: 'Trusted' })).toBeInTheDocument();
    expect(languageOf(screen.getByText('Trusted'))).toEqual({
      lang: 'en',
      dir: 'ltr',
    });
  });
});
