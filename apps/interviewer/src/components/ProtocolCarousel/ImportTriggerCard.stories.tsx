import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  expect,
  fireEvent,
  fn,
  userEvent,
  waitFor,
  within,
} from 'storybook/test';

import { ImportTriggerCard } from './ImportTriggerCard';

const NETCANVAS_ACCEPT = { 'application/x-netcanvas': ['.netcanvas'] };

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
  onActivate: () => void;
  onImportFile: (file: File) => void;
};

function ImportTriggerCardStory({
  onActivate,
  onImportFile,
}: Pick<StoryArgs, 'onActivate' | 'onImportFile'>) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => {
      const file = files[0];
      if (file) onImportFile(file);
    },
    accept: NETCANVAS_ACCEPT,
    multiple: false,
    noClick: true,
    noKeyboard: true,
  });

  return (
    <ImportTriggerCard
      onActivate={onActivate}
      getRootProps={getRootProps}
      getInputProps={getInputProps}
      isDragActive={isDragActive}
    />
  );
}

const meta: Meta<StoryArgs> = {
  title: 'Components/ImportTriggerCard',
  parameters: { layout: 'centered' },
  args: { size: 480, onActivate: fn(), onImportFile: fn() },
  argTypes: {
    size: { control: { type: 'range', min: 140, max: 720, step: 4 } },
    onActivate: { control: false },
    onImportFile: { control: false },
  },
  render: ({ size, onActivate, onImportFile }) => (
    <ResizableFrame size={size}>
      <ImportTriggerCardStory
        onActivate={onActivate}
        onImportFile={onImportFile}
      />
    </ResizableFrame>
  ),
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};

// Exercises the card's real import surface: dragging a file over it highlights
// the dashed border, dropping the file reports it through onImportFile, and a
// plain click opens the file picker (onActivate).
export const DropAndClickToImport: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const surface = canvas.getByRole('button', { name: 'Import a protocol' });
    const card = surface.parentElement;
    if (!(card instanceof HTMLElement)) {
      throw new Error('import card wrapper not found');
    }

    // Base state: the dashed outline border, not highlighted.
    await expect(card).toHaveClass('border-outline');

    const file = new File(['netcanvas'], 'study.netcanvas', {
      type: 'application/x-netcanvas',
    });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    // A real DragEvent carries the DataTransfer on its read-only `dataTransfer`
    // property; fireEvent's plain-object init doesn't populate `files`.
    const dragEvent = (type: string) =>
      new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer });

    // Dragging a file over the card highlights it.
    await fireEvent(card, dragEvent('dragenter'));
    await waitFor(() => expect(card).toHaveClass('border-sea-green'));

    // Dropping reports the file and clears the highlight.
    await fireEvent(card, dragEvent('drop'));
    await waitFor(() => expect(args.onImportFile).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(card).toHaveClass('border-outline'));

    // A plain click opens the file picker.
    await userEvent.click(surface);
    await expect(args.onActivate).toHaveBeenCalledTimes(1);
  },
};
