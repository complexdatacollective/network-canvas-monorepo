import { Loader2 } from 'lucide-react';
import { type ReactNode, type RefObject } from 'react';

import { type CSSVariablesStyle } from '../utils/cssVariables';
import { cx } from '../utils/cva';
import { NODE_SHAPE_TOKEN_STYLE } from './NodeShapeArtwork';
import { type ParsedNodeShapeSvg } from './nodeShapeSvg';

// `currentColor` in an artwork means the node's colour; on the HTML label it
// would otherwise resolve to the root's white text.
const resolveCustomLabelColor = (labelColor: string | undefined) => {
  if (labelColor === undefined) return 'var(--text)';
  return /^currentcolor$/i.test(labelColor.trim()) ? 'var(--base)' : labelColor;
};

const customLabelAreaStyle = ({
  labelArea,
  labelColor,
}: ParsedNodeShapeSvg): CSSVariablesStyle => ({
  ...NODE_SHAPE_TOKEN_STYLE,
  left: `${labelArea.x * 100}%`,
  top: `${labelArea.y * 100}%`,
  width: `${labelArea.width * 100}%`,
  height: `${labelArea.height * 100}%`,
  color: resolveCustomLabelColor(labelColor),
});

type NodeLabelAreaProps = {
  boxRef: RefObject<HTMLSpanElement | null>;
  labelRef: RefObject<HTMLSpanElement | null>;
  label: string;
  labelClassName: string;
  labelLineClamp: number | undefined;
  /** The node's custom artwork, whose label area the label is placed in. */
  customShape: ParsedNodeShapeSvg | null;
  /** Whether the artwork's label plate is drawn taller for this label. */
  plateGrown: boolean;
  loading: boolean;
  children?: ReactNode;
};

/**
 * The node's content layer: positioned so it paints above the shape layer,
 * and the fixed-size box the label is fitted to.
 */
export function NodeLabelArea({
  boxRef,
  labelRef,
  label,
  labelClassName,
  labelLineClamp,
  customShape,
  plateGrown,
  loading,
  children,
}: NodeLabelAreaProps) {
  return (
    <span
      ref={boxRef}
      data-node-label-area={customShape ? true : undefined}
      // Placed over the artwork's label area, which is drawn by coordinates
      // and does not mirror.
      data-direction-exempt={customShape ? true : undefined}
      className={
        customShape
          ? cx(
              'absolute flex min-w-0 justify-center',
              plateGrown
                ? 'items-start overflow-visible'
                : 'items-center overflow-hidden',
            )
          : 'relative flex size-full min-w-0 items-center justify-center overflow-hidden rounded-[inherit]'
      }
      style={customShape ? customLabelAreaStyle(customShape) : undefined}
    >
      {loading && <Loader2 className="animate-spin" size={24} />}
      {!loading && (
        // A label is usually a name a participant typed, in any script: it
        // takes the direction of its own text, so a Latin name ending in
        // punctuation ("team-b!") keeps it at the end in a right-to-left
        // interview. The label is centred, so its side does not change.
        // oxlint-disable-next-line direction/typed-text-matches-parent -- labelVariants centre the label (text-center), so it has no side to keep
        <span
          ref={labelRef}
          dir="auto"
          className={labelClassName}
          style={
            labelLineClamp === undefined
              ? undefined
              : { WebkitLineClamp: labelLineClamp }
          }
        >
          {label}
        </span>
      )}
      {children}
    </span>
  );
}
