import type React from 'react';
import { useEffect, useMemo, useState } from 'react';

import { cx } from './utils/cva';
import { withNoSSRWrapper } from './utils/NoSSRWrapper';

const DEFAULT_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
};

type TimeAgoProps = Omit<
  React.TimeHTMLAttributes<HTMLTimeElement>,
  'onClick'
> & {
  date: Date | string | number;
  dateOptions?: Intl.DateTimeFormatOptions;
  onClick?: React.MouseEventHandler<HTMLSpanElement>;
};

const TimeAgo: React.FC<TimeAgoProps> = ({
  date: dateProp,
  dateOptions,
  className,
  onClick,
  ...props
}) => {
  const date = useMemo(() => new Date(dateProp), [dateProp]);
  const opts = dateOptions ?? DEFAULT_DATE_OPTIONS;
  const localisedDate = new Intl.DateTimeFormat(
    navigator.language,
    opts,
  ).format(date);

  const [timeAgo, setTimeAgo] = useState<string>('');
  // Click anywhere on the time element to flip between the relative
  // ("2 days ago") rendering and the raw locale-formatted timestamp.
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    const calculateTimeAgo = () => {
      const now = new Date();
      const distance = now.getTime() - date.getTime();

      if (distance < 60000) {
        setTimeAgo('just now');
      } else if (distance < 3600000) {
        const singleOrPlural =
          Math.floor(distance / 60000) === 1 ? 'minute' : 'minutes';
        setTimeAgo(`${Math.floor(distance / 60000)} ${singleOrPlural} ago`);
      } else if (distance < 86400000) {
        const singleOrPlural =
          Math.floor(distance / 3600000) === 1 ? 'hour' : 'hours';
        setTimeAgo(`${Math.floor(distance / 3600000)} ${singleOrPlural} ago`);
      } else if (distance < 604800000) {
        const singleOrPlural =
          Math.floor(distance / 86400000) === 1 ? 'day' : 'days';
        setTimeAgo(`${Math.floor(distance / 86400000)} ${singleOrPlural} ago`);
      } else {
        // More than a week ago, fall back to Intl.DateTimeFormat
        setTimeAgo(localisedDate);
      }
    };

    calculateTimeAgo();

    // Update time ago every minute
    const interval = setInterval(calculateTimeAgo, 60000);

    return () => clearInterval(interval);
  }, [date, localisedDate]);

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={(event) => {
        setShowRaw((prev) => !prev);
        onClick?.(event);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          setShowRaw((prev) => !prev);
        }
      }}
      className={cx('cursor-pointer select-none', className)}
    >
      <time
        {...props}
        data-testid="time-ago"
        dateTime={localisedDate}
        title={localisedDate}
      >
        {showRaw ? localisedDate : timeAgo}
      </time>
    </span>
  );
};

export default withNoSSRWrapper(TimeAgo);
