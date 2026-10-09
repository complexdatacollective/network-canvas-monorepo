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

const HEADINGS = {
  attributes: 'Attributes',
  links: 'Links',
  groups: undefined,
};

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

// The interview sets one language for everything it renders, so a label names
// none of its own, nor does any wrapper between it and the switcher.
const marksOwnLanguage = (text: string) =>
  screen.getByText(text).closest('[lang], [dir]') !== null;

afterEach(() => {
  cleanup();
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
