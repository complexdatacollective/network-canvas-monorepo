'use client';

import type React from 'react';
import { useEffect, useMemo, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

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

const messages = defineMessages({
  justNow: {
    id: 'frescoUi.timeAgo.justNow',
    defaultMessage: 'just now',
    description: 'Relative timestamp for an event less than one minute ago.',
  },
});

function formatTimeAgo(
  date: Date,
  now: number,
  localisedDate: string,
  intl: IntlShape,
): string {
  const distance = now - date.getTime();
  if (distance < MINUTE_MS) {
    return intl.formatMessage(messages.justNow);
  }
  if (distance < HOUR_MS) {
    const minutes = Math.floor(distance / MINUTE_MS);
    return intl.formatRelativeTime(-minutes, 'minute');
  }
  if (distance < DAY_MS) {
    const hours = Math.floor(distance / HOUR_MS);
    return intl.formatRelativeTime(-hours, 'hour');
  }
  if (distance < WEEK_MS) {
    const days = Math.floor(distance / DAY_MS);
    return intl.formatRelativeTime(-days, 'day');
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
  const intl = useAppIntl();
  const date = useMemo(() => new Date(dateProp), [dateProp]);
  const opts = dateOptions ?? DEFAULT_DATE_OPTIONS;
  const localisedDate = useMemo(
    () => intl.formatDate(date, opts),
    [date, opts, intl],
  );

  // Computed synchronously for the very first paint: deriving this in an
  // effect rendered an empty element whose width then jumped — a visible
  // flicker on every mount (and table cells remount on unrelated re-renders).
  const [now, setNow] = useState(() => Date.now());
  const timeAgo = formatTimeAgo(date, now, localisedDate, intl);
  // Click anywhere on the time element to flip between the relative
  // ("2 days ago") rendering and the raw locale-formatted timestamp.
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    const update = () => {
      setNow(Date.now());
    };

    update();

    // Update time ago every minute
    const interval = setInterval(update, MINUTE_MS);

    return () => clearInterval(interval);
  }, [date]);

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
        dateTime={date.toISOString()}
        title={localisedDate}
      >
        {showRaw ? localisedDate : timeAgo}
      </time>
    </span>
  );
};

export default withNoSSRWrapper(TimeAgo);
