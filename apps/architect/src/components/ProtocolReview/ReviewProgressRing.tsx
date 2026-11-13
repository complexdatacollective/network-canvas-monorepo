import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

const messages = defineMessages({
  label: {
    id: 'architect.protocolReview.progressRing.label',
    defaultMessage: 'Review progress',
    description:
      'Accessible name, read by screen readers, of the small circular progress indicator on the Review protocol toolbar button while an automated protocol review runs.',
  },
});

const RADIUS = 9;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * How far a running review has got, as a ring the size of an icon. Exposed
 * as a progress bar with its value; the ring is drawn in the current text
 * colour over a faint track, so it reads in every theme.
 */
const ReviewProgressRing = ({ fraction }: { fraction: number }) => {
  const intl = useAppIntl();
  const clamped = Math.min(1, Math.max(0, fraction));
  const percent = Math.round(clamped * 100);
  return (
    <svg
      role="progressbar"
      aria-label={intl.formatMessage(messages.label)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={intl.formatNumber(clamped, {
        style: 'percent',
        maximumFractionDigits: 0,
      })}
      viewBox="0 0 24 24"
      className="size-5 shrink-0 -rotate-90 rtl:scale-x-[-1]"
    >
      <circle
        cx="12"
        cy="12"
        r={RADIUS}
        fill="none"
        strokeWidth="3"
        className="stroke-current opacity-20"
      />
      <circle
        cx="12"
        cy="12"
        r={RADIUS}
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={CIRCUMFERENCE * (1 - clamped)}
        className="stroke-current motion-safe:transition-[stroke-dashoffset] motion-safe:duration-500"
      />
    </svg>
  );
};

export default ReviewProgressRing;
