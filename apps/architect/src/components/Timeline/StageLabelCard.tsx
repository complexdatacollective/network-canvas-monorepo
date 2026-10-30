import type { CSSProperties, ReactElement, ReactNode } from 'react';

import { stageColorStyle } from '@codaco/fresco-ui/stages/stageTypes';
import Heading, { headingVariants } from '@codaco/fresco-ui/typography/Heading';
import { cx } from '@codaco/fresco-ui/utils/cva';

// Several stage colours fall below AA as caption text on the page, so the
// caption keeps the hue but moves 35% toward the ink contrast-color() picks for
// the page, as Badge does.
function captionColor(type: string) {
  return `color-mix(in oklab, ${stageColorStyle(type).color}, contrast-color(var(--background)) 35%)`;
}

type StageLabelCardProps = {
  /** A stage type. One this build does not know takes a neutral grey. */
  type: string;
  title: ReactNode;
  /** The stage's interface, set small in the stage type's colour. */
  caption: ReactNode;
  /** Renders the title in place of an `h4`, where the card is decoration. */
  titleRender?: ReactElement;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
};

/**
 * A stage's name over its interface on a translucent card, as it sits beside
 * the stage's stop on the start screen's timeline and on the protocol
 * timeline.
 */
export default function StageLabelCard({
  type,
  title,
  caption,
  titleRender,
  children,
  className,
  style,
}: StageLabelCardProps) {
  return (
    <div
      className={cx(
        'min-w-0 rounded-[40px] bg-white/40 px-8 py-4 shadow-[0_8px_20px_rgba(22,21,43,0.10)]',
        className,
      )}
      style={style}
    >
      <Heading
        level="h4"
        margin="none"
        render={titleRender}
        className="text-[19px] leading-[1.1] font-extrabold text-balance text-[hsl(240_35%_17%)]"
      >
        {title}
      </Heading>
      <div
        className={headingVariants({
          level: 'label',
          variant: 'all-caps',
          margin: 'none',
          className:
            'pt-2.5 text-[12px] leading-[1.2] font-bold tracking-[0.16em] text-balance',
        })}
        style={{ color: captionColor(type) }}
      >
        {caption}
      </div>
      {children}
    </div>
  );
}
