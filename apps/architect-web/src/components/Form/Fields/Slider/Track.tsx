import { cx } from '~/utils/cva';

import type { SliderType } from './Slider';

type TrackProps = {
  source: {
    id: string;
    value: number;
    percent: number;
  };
  target: {
    id: string;
    value: number;
    percent: number;
  };
  getTrackProps: () => Record<string, unknown>;
  isFirst?: boolean;
  isLast?: boolean;
  sliderType?: SliderType;
};

const Track = ({
  source,
  target,
  getTrackProps,
  isFirst = false,
  isLast = false,
  sliderType = null,
}: TrackProps) => {
  const isLikertOrVas = sliderType === 'LIKERT' || sliderType === 'VAS';

  return (
    <div
      className={cx(
        'absolute top-1/2 z-(--z-fx) box-content h-(--space-xl) -translate-y-1/2 cursor-pointer',
        isFirst && '-translate-x-(--space-md) pl-(--space-md)',
        isLast && 'pr-(--space-md)',
      )}
      style={{
        left: `${source.percent}%`,
        width: `${target.percent - source.percent}%`,
      }}
      {...getTrackProps()}
    >
      <div
        className={cx(
          'bg-platinum absolute top-1/2 left-0 h-(--space-md) w-full -translate-y-1/2 rounded-full',
          isFirst &&
            'bg-active left-(--space-md) w-[calc(100%-var(--space-md))]',
          isLast && 'w-[calc(100%-var(--space-md))]',
          isLikertOrVas && 'rounded-none',
          isFirst && isLikertOrVas && 'bg-platinum',
        )}
      />
    </div>
  );
};

export default Track;
