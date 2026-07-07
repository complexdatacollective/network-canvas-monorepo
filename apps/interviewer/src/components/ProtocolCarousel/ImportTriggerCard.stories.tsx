import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';

import { ImportTriggerCard } from './ImportTriggerCard';

// The always-last card in the deck: a dashed, translucent card that is
// itself the import surface — click it to open the file picker, or drop a
// `.netcanvas` file onto it. Deliberately matches DeckCard's footprint (same
// radius + shadow) so it reads as "one more card" rather than chrome.
// The frosted-glass look (backdrop-blur) is applied by DeckCarousel's
// slide wrapper, not this component (see ImportTriggerCard.tsx), so it isn't
// reproduced here.
function ResizableFrame({
  size = 480,
  children,
}: {
  size?: number;
  children: ReactNode;
}) {
  return (
    <div
      className="ring-outline/40 resize overflow-hidden ring-2"
      style={{ width: size, height: size, minWidth: 140, minHeight: 140 }}
    >
      {children}
    </div>
  );
}

type StoryArgs = {
  size: number;
};

const meta: Meta<StoryArgs> = {
  title: 'Components/ImportTriggerCard',
  parameters: { layout: 'centered' },
  args: { size: 480 },
  argTypes: {
    size: { control: { type: 'range', min: 140, max: 720, step: 4 } },
  },
  render: ({ size }) => (
    <ResizableFrame size={size}>
      <ImportTriggerCard onActivate={() => {}} onImportFile={() => {}} />
    </ResizableFrame>
  ),
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};
