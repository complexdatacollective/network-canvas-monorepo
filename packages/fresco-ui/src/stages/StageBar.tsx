import type * as React from 'react';

import { cx } from '../utils/cva';
import { stageTypeColorStyle } from './stageTypes';

type StageBarStage = {
  type: string;
};

type StageBarProps = {
  /** The stage sequence, in interview order. Only `type` is read. */
  stages: readonly StageBarStage[];
  /**
   * Accessible summary of the sequence, such as "24 stages: 1 sociogram,
   * 1 dyad census". When given, the bar is exposed as an image with this
   * name; without it the bar is decoration and hidden from assistive
   * technology, on the assumption that the same information is written out
   * beside it.
   */
  label?: string;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'children'>;

/**
 * A stage sequence as a strip of equal segments, one per stage, each in its
 * interface's colour from `STAGE_TYPE_COLORS`. Reads a protocol's shape at a
 * glance: how long it is and where its name generators, censuses and
 * sociograms fall.
 */
export function StageBar({
  stages,
  label,
  className,
  ...props
}: StageBarProps) {
  return (
    <div
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cx(
        'flex h-2 w-full gap-px overflow-hidden rounded-full bg-current/10',
        className,
      )}
      {...props}
    >
      {stages.map((stage, index) => (
        <span
          key={`${index}-${stage.type}`}
          className="min-w-0 flex-1"
          style={{ backgroundColor: stageTypeColorStyle(stage.type).color }}
        />
      ))}
    </div>
  );
}
