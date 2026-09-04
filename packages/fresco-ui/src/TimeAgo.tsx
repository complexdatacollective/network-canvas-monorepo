'use client';

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

const MINUTE_MS = 60000;
const HOUR_MS = 3600000;
const DAY_MS = 86400000;
const WEEK_MS = 604800000;

function formatTimeAgo(date: Date, localisedDate: string): string {
  const distance = Date.now() - date.getTime();
  if (distance < MINUTE_MS) {
    return 'just now';
  }
  if (distance < HOUR_MS) {
    const minutes = Math.floor(distance / MINUTE_MS);
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  }
  if (distance < DAY_MS) {
    const hours = Math.floor(distance / HOUR_MS);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  }
  if (distance < WEEK_MS) {
    const days = Math.floor(distance / DAY_MS);
    return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  }
  // More than a week ago, fall back to the locale-formatted timestamp.
  return localisedDate;
}

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
  const localisedDate = useMemo(
    () => new Intl.DateTimeFormat(navigator.language, opts).format(date),
    [date, opts],
  );

  // Computed synchronously for the very first paint: deriving this in an
  // effect rendered an empty element whose width then jumped — a visible
  // flicker on every mount (and table cells remount on unrelated re-renders).
  const [timeAgo, setTimeAgo] = useState(() =>
    formatTimeAgo(date, localisedDate),
  );
  // Click anywhere on the time element to flip between the relative
  // ("2 days ago") rendering and the raw locale-formatted timestamp.
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    const update = () => {
      // Setting an unchanged string is a no-op render-wise; React bails out.
      setTimeAgo(formatTimeAgo(date, localisedDate));
    };

    update();

    // Update time ago every minute
    const interval = setInterval(update, MINUTE_MS);

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
