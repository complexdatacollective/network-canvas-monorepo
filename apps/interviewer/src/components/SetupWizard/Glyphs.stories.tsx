import type { Meta, StoryObj } from '@storybook/react-vite';

import AuthorisationGlyph from './AuthorisationGlyph';
import SecureDataGlyph from './SecureDataGlyph';
import SetupGlyph from './SetupGlyph';

// The three decorative wizard-step SVGs. AuthorisationGlyph and
// SecureDataGlyph are fixed at `size-6` (they're always shown at 24px inside
// a badge circle in SetupWizardDialog), so only SetupGlyph — the one glyph
// that scales to its container width (`w-full h-auto`) — resizes with the
// `size` control. All three inherit `currentColor`, so `color` retints
// every glyph.
const GLYPHS = [
  { name: 'Setup', Glyph: SetupGlyph, sizable: true },
  { name: 'Authorisation', Glyph: AuthorisationGlyph, sizable: false },
  { name: 'SecureData', Glyph: SecureDataGlyph, sizable: false },
] as const;

type StoryArgs = { size: number; color: string };

const meta: Meta<StoryArgs> = {
  title: 'Auth/Wizard Glyphs',
  parameters: { layout: 'centered' },
  args: { size: 96, color: '#3b2f6b' },
  argTypes: {
    size: {
      control: { type: 'range', min: 32, max: 240, step: 8 },
      description: 'Wrapper width for SetupGlyph (the only glyph that scales)',
    },
    color: { control: 'color' },
  },
  render: ({ size, color }) => (
    <div className="flex items-end gap-8" style={{ color }}>
      {GLYPHS.map(({ name, Glyph, sizable }) => (
        <figure key={name} className="flex flex-col items-center gap-2">
          {sizable ? (
            <div style={{ width: size }}>
              <Glyph />
            </div>
          ) : (
            <Glyph />
          )}
          <figcaption className="text-text/60 text-xs">{name}</figcaption>
        </figure>
      ))}
    </div>
  ),
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};
