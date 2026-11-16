'use client';

import { motion } from 'motion/react';

import { type DragMetadata, useDropTarget } from '@codaco/fresco-ui/dnd/dnd';
import { cx } from '@codaco/fresco-ui/utils/cva';
import type { NcNode } from '@codaco/shared-consts';

type NodeBinProps = {
  accepts: (node: NcNode) => boolean;
  dropHandler: (node: NcNode, metadata?: DragMetadata) => void;
};

const LID_ROTATION = 'rotate(-11.65)';

/*
 * The bin is drawn inline rather than loaded from an `.svg` file. Every host
 * compiles this package from source with its own bundler, and they disagree
 * on what a default `.svg` import is: Vite returns a URL string, Next.js a
 * `{ src, width, height }` object, which an `<img src>` renders as the
 * broken "[object Object]". Inline markup needs no asset handling at all.
 *
 * It also avoids the problem a child div with `background-image` had under
 * the motion.div parent: React passed the style prop, but the inline `style`
 * attribute never reached the rendered child.
 *
 * Fills are attributes, not classes in a <style> element, so nothing leaks
 * into the page's stylesheet, and the drawing has no ids to collide with
 * other inline SVGs.
 */
const BinIllustration = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 120 140"
    aria-hidden="true"
    focusable="false"
    data-testid="node-bin-illustration"
    className="size-full"
  >
    <rect
      fill="#ddd"
      x="64.33"
      y="43.16"
      width="16"
      height="16"
      rx="7.91"
      ry="7.91"
    />
    <rect
      fill="#ddd"
      x="97.68"
      y="29.16"
      width="16"
      height="16"
      rx="7.91"
      ry="7.91"
    />
    <polygon
      fill="#00c9a2"
      points="93.62 140 26.38 140 10 52 110 52 93.62 140"
    />
    <polygon
      fill="#00b18f"
      points="110 52 93.62 140 26.38 140 24.76 131.24 104 52 110 52"
    />
    <rect
      fill="#00c9a2"
      x="8.09"
      y="13.32"
      width="103.82"
      height="18.32"
      transform={`translate(-3.3 12.58) ${LID_ROTATION}`}
    />
    <polygon
      fill="#00b18f"
      points="112.69 20.97 50.24 33.85 64.48 12.21 108.99 3.03 112.69 20.97"
    />
    <circle
      fill="#00c9a2"
      cx="9.16"
      cy="32.97"
      r="9.16"
      transform={`translate(-6.47 2.53) ${LID_ROTATION}`}
    />
    <circle
      fill="#00b18f"
      cx="110.84"
      cy="12"
      r="9.16"
      transform={`translate(-0.14 22.63) ${LID_ROTATION}`}
    />
    <rect
      fill="#00c9a2"
      x="36.61"
      y="4.35"
      width="43.08"
      height="18.32"
      transform={`translate(-1.53 12.02) ${LID_ROTATION}`}
    />
    <polygon
      fill="#00b18f"
      points="81.1 18.13 57.34 23.03 71.65 1.38 77.4 0.19 81.1 18.13"
    />
    <circle
      fill="#00c9a2"
      cx="37.05"
      cy="17.86"
      r="9.16"
      transform={`translate(-2.84 7.85) ${LID_ROTATION}`}
    />
    <circle
      fill="#00b18f"
      cx="79.25"
      cy="9.16"
      r="9.16"
      transform={`translate(-0.22 16.19) ${LID_ROTATION}`}
    />
  </svg>
);

const NodeBin = ({ accepts, dropHandler }: NodeBinProps) => {
  const { dropProps, isOver, willAccept } = useDropTarget({
    id: 'node-bin',
    accepts: ['EXISTING_NODE', 'FAMILY_TREE_NODE'],
    announcedName: 'Delete bin',
    onDrop: (metadata) => {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- drag metadata is the dragged node, set by the Node drag source (fresco-ui types it as a record)
      const node = metadata as NcNode;
      if (accepts(node)) {
        dropHandler(node, metadata);
      }
    },
  });

  return (
    <motion.div
      {...dropProps}
      data-drop-target-valid={willAccept || undefined}
      className={cx(
        'pointer-events-auto absolute bottom-7 left-1/2 z-50',
        'h-28 w-20 -translate-x-1/2 overflow-hidden',
        'drop-shadow-[0_calc(2.4*var(--theme-root-size))_calc(2.4*var(--theme-root-size))_var(--nc-drop-shadow-color,rgba(0,0,0,0.3))]',
      )}
      initial={{ opacity: 0, y: '25%' }}
      animate={
        willAccept
          ? {
              opacity: 1,
              y: 0,
              scale: isOver ? 1.5 : 1,
            }
          : { opacity: 0, y: '25%', scale: 1 }
      }
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
    >
      <BinIllustration />
    </motion.div>
  );
};

export default NodeBin;
