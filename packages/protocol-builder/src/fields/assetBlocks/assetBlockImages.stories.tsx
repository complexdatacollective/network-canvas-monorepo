import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';

import { RenderMarkdown } from '@codaco/fresco-ui/RenderMarkdown';

import { AssetBlockLine, createAssetBlockImages } from './assetBlockImages.tsx';
import { messages } from './assetBlockMessages.ts';

const ASSETS = {
  a1: { kind: 'image', name: 'harbour.png' },
  b2: { kind: 'audio', name: 'instructions.mp3' },
  c3: { kind: 'video', name: 'walkthrough.mp4' },
} as const;

// The files of a protocol, as a page that reads text finds them; any other
// id names a file the protocol does not hold.
const images = createAssetBlockImages((assetId) =>
  assetId === 'a1' || assetId === 'b2' || assetId === 'c3'
    ? ASSETS[assetId]
    : undefined,
);

/** Text that holds files as blocks, read as a translation-table cell reads it. */
function TextHoldingFiles({ text }: Readonly<{ text: string }>) {
  return (
    <div className="w-[480px]">
      <RenderMarkdown blockImages={images}>{text}</RenderMarkdown>
    </div>
  );
}

const meta = {
  title: 'Protocol Builder/Fields/Asset block lines',
  component: TextHoldingFiles,
  args: {
    text: [
      'Welcome to the study.',
      '![A map of the harbour](asset:a1?size=small)',
      '![](asset:b2)',
      '![A walkthrough](asset:c3)',
      '![Lost](asset:gone)',
      'Please read on.',
    ].join('\n\n'),
  },
} satisfies Meta<typeof TextHoldingFiles>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The line each block is drawn as, by the kind of file it holds. */
const linesIn = (canvasElement: HTMLElement) =>
  [...canvasElement.querySelectorAll<HTMLElement>('[data-asset-block]')].map(
    (line) => ({
      kind: line.dataset.assetBlock,
      name: line.querySelector('bdi')?.textContent ?? line.textContent,
      line,
    }),
  );

/**
 * Text holding a picture, a recording, a video and a file the protocol no
 * longer has. Each is one line naming the file — by its description, or by
 * the file's name where it has none — beside a mark of what kind of file it
 * is; none is drawn or played, since many such texts share a page.
 */
export const NamedRatherThanDrawn: Story = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('img, audio, video')).toBeNull();
    const lines = linesIn(canvasElement);
    await expect(lines.map(({ kind, name }) => ({ kind, name }))).toEqual([
      { kind: 'image', name: 'A map of the harbour' },
      { kind: 'audio', name: 'instructions.mp3' },
      { kind: 'video', name: 'A walkthrough' },
      { kind: '', name: messages.unusable.defaultMessage },
    ]);
    // Each mark is drawn, on the line of the words it marks.
    for (const { line } of lines) {
      const mark = line.querySelector('svg');
      if (mark === null) throw new Error('A line has no mark');
      const markBox = mark.getBoundingClientRect();
      const words = line.lastElementChild;
      if (words === null) throw new Error('A line has no words');
      const wordsBox = words.getBoundingClientRect();
      await expect(markBox.width).toBeGreaterThan(0);
      await expect(markBox.bottom).toBeGreaterThan(wordsBox.top);
      await expect(markBox.top).toBeLessThan(wordsBox.bottom);
    }
    // And the text around them, as it was written.
    await expect(canvasElement).toHaveTextContent(/^Welcome to the study\./);
    await expect(canvasElement).toHaveTextContent(/Please read on\.$/);
  },
};

/**
 * One line on its own, as the translation table draws a block in a cell
 * being edited: a name in another script than the text around it keeps its
 * own direction rather than taking the line's.
 */
export const ALineOnItsOwn: Story = {
  render: () => (
    <p>
      {'Before. '}
      <AssetBlockLine kind="image" name="خريطة الميناء.png" />
      {' After.'}
    </p>
  ),
  play: async ({ canvasElement }) => {
    const name = canvasElement.querySelector('bdi');
    await expect(name).toHaveTextContent('خريطة الميناء.png');
    await expect(name === null ? '' : getComputedStyle(name).unicodeBidi).toBe(
      'isolate',
    );
  },
};
