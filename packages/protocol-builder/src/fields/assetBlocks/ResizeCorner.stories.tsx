import type { Meta, StoryObj } from '@storybook/react-vite';
import { useRef, useState } from 'react';
import { expect, fireEvent, fn, spyOn, waitFor, within } from 'storybook/test';

import type { SizeChoice } from './assetBlockMessages.ts';
import type { DrawnFile } from './drawnFile.ts';
import { ResizeCorner } from './ResizeCorner.tsx';

// How wide the block's box is, and so how tall a square picture drawn as
// large as it is.
const BOX = 480;

type CornerProps = Readonly<{
  drawn: DrawnFile & { ratio: number };
  size: SizeChoice;
  onDrag: (size: SizeChoice | undefined) => void;
  onDrop: (size: SizeChoice) => void;
}>;

/**
 * A block's box with a square picture drawn in it where `drawn` says, and the
 * corner that resizes it, held as a block's view holds it: the size dragged
 * to is the one named while the corner is held, and the block's once it is
 * let go.
 */
function CornerOnAPicture({ drawn, size, onDrag, onDrop }: CornerProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [held, setHeld] = useState(size);
  const [dragged, setDragged] = useState<SizeChoice | undefined>(undefined);
  return (
    <div
      ref={boxRef}
      data-testid="box"
      className="relative"
      style={{ width: BOX, height: drawn.height }}
    >
      <div
        className="bg-primary/30 absolute rounded"
        style={{
          left: drawn.left,
          top: drawn.top,
          width: drawn.width,
          height: drawn.height,
        }}
      />
      <ResizeCorner
        boxRef={boxRef}
        drawn={drawn}
        size={dragged ?? held}
        onDrag={(next) => {
          setDragged(next);
          onDrag(next);
        }}
        onDrop={(next) => {
          setDragged(undefined);
          setHeld(next);
          onDrop(next);
        }}
      />
    </div>
  );
}

const meta = {
  title: 'Protocol Builder/Fields/Asset block resize corner',
  component: CornerOnAPicture,
  // The corner is placed from the left or the right of the box by where the
  // picture sits in it, which is measured from the left whichever way the
  // text runs: there is no mirrored drawing of it to compare.
  tags: ['!mirror'],
  args: {
    drawn: { left: 0, top: 0, width: BOX, height: BOX, ratio: 1, across: 0 },
    size: 'full',
    onDrag: fn(),
    onDrop: fn(),
  },
} satisfies Meta<typeof CornerOnAPicture>;

export default meta;
type Story = StoryObj<typeof meta>;

const cornerIn = (canvasElement: HTMLElement): HTMLElement => {
  const corner = canvasElement.querySelector('[data-asset-block-resize]');
  if (!(corner instanceof HTMLElement)) throw new Error('No corner');
  return corner;
};

/**
 * Takes hold of `corner` at its middle, moves it by `by`, runs `whileHeld`,
 * and lets go where it was moved to.
 *
 * The corner captures the pointer as it is pressed, which a browser refuses,
 * or ends at once, for a pointer no device produced; capture is the
 * browser's to give a real pointer, so it is stood in for here, as in the
 * other stories that drag a handle.
 */
const dragCorner = async (
  corner: HTMLElement,
  by: Readonly<{ x: number; y: number }>,
  whileHeld: () => Promise<void>,
) => {
  const setCapture = spyOn(
    window.HTMLElement.prototype,
    'setPointerCapture',
  ).mockImplementation(() => {});
  try {
    const { left, top, width, height } = corner.getBoundingClientRect();
    const pointer = { pointerId: 1, pointerType: 'mouse', button: 0 };
    const from = { clientX: left + width / 2, clientY: top + height / 2 };
    const to = { clientX: from.clientX + by.x, clientY: from.clientY + by.y };
    await fireEvent.pointerDown(corner, { ...pointer, buttons: 1, ...from });
    await fireEvent.pointerMove(corner, { ...pointer, buttons: 1, ...to });
    await whileHeld();
    await fireEvent.pointerUp(corner, { ...pointer, ...to });
  } finally {
    setCapture.mockRestore();
  }
};

/**
 * A picture drawn as large as it is, its corner pulled up to the height of
 * the smallest size: named as the corner moves, and the picture's once it is
 * let go.
 */
export const DraggedToASmallerSize: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const corner = cornerIn(canvasElement);
    // At the bottom right of the box, for a picture against its left.
    const box = canvas.getByTestId('box').getBoundingClientRect();
    const at = corner.getBoundingClientRect();
    await expect(at.left).toBeGreaterThan(box.right - at.width);
    await expect(at.top).toBeGreaterThan(box.bottom - at.height);

    // The smallest size holds a picture to 192px: 290px up from 480.
    await dragCorner(corner, { x: 0, y: -290 }, async () => {
      await waitFor(() => expect(canvas.getByText('Small')).toBeVisible());
      await expect(args.onDrag).toHaveBeenLastCalledWith('small');
    });
    await expect(args.onDrop).toHaveBeenCalledOnce();
    await expect(args.onDrop).toHaveBeenCalledWith('small');
    // Let go, the size is no longer named over the picture.
    await expect(canvas.queryByText('Small')).toBeNull();
  },
};

/**
 * A small picture held against the right of its box: the corner is at the
 * box's bottom left, and pulling it away from the picture, to the left, makes
 * the picture larger — along the side of the picture as well as down.
 */
export const HeldAgainstTheRight: Story = {
  args: {
    drawn: {
      left: BOX - 192,
      top: 0,
      width: 192,
      height: 192,
      ratio: 1,
      across: 1,
    },
    size: 'small',
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const corner = cornerIn(canvasElement);
    const box = canvas.getByTestId('box').getBoundingClientRect();
    await expect(corner.getBoundingClientRect().right).toBeLessThan(
      box.left + corner.getBoundingClientRect().width,
    );

    // 300px across from 192 is past every size but the picture's own.
    await dragCorner(corner, { x: -300, y: 0 }, async () => {
      await waitFor(() => expect(canvas.getByText('Full size')).toBeVisible());
    });
    await expect(args.onDrop).toHaveBeenCalledOnce();
    await expect(args.onDrop).toHaveBeenCalledWith('full');
  },
};
