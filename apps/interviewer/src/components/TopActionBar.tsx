import { Lock, Settings } from 'lucide-react';
import { motion } from 'motion/react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { IconButton } from '@codaco/fresco-ui/Button';
import FeedbackPopover, {
  type FeedbackPopoverProps,
} from '@codaco/fresco-ui/navigation/FeedbackPopover';
import { appFeedbackSurvey } from '@codaco/shared-consts';
import { ViewSwitcher } from '~/components/ViewSwitcher';
import InterviewerLocaleSwitcher from '~/i18n/InterviewerLocaleSwitcher';
import { useAnalytics } from '~/lib/analytics/AnalyticsProvider';
import { sendFeedbackEvent } from '~/lib/analytics/sendFeedbackEvent';
import { useAuth } from '~/lib/auth/AuthContext';

const messages = defineMessages({
  lockApp: {
    id: 'interviewer.topActionBar.lockApp',
    defaultMessage: 'Lock app',
    description:
      'Accessible name of the icon-only lock button in the home top bar; pressing it locks the app immediately. Read only by screen readers.',
  },
  settings: {
    id: 'interviewer.topActionBar.settings',
    defaultMessage: 'Settings',
    description:
      'Accessible name of the icon-only gear button in the home top bar; pressing it opens Settings. Read only by screen readers.',
  },
});

// Icon buttons in the top bar share the SegmentedSwitcher's size token so
// their heights line up (switcher height == Button height per token).
const TOP_BAR_SIZE = 'md';

const variants = {
  hidden: { opacity: 0, y: -6 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55 } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.55 } },
};

// Pure presentation: the view switcher plus the language, feedback, lock
// (when a security mode is enrolled) and settings glass-pill buttons. The language
// control lives here rather than in the status row so it stays reachable from
// the data view, which has no status row.
export function TopActionBarView({
  feedback,
  showLock,
  onLock,
  onOpenSettings,
}: {
  feedback: Pick<FeedbackPopoverProps, 'onSubmit' | 'onShown' | 'maxLength'>;
  showLock: boolean;
  onLock: () => void;
  onOpenSettings: () => void;
}) {
  const intl = useAppIntl();
  return (
    <div className="flex items-center gap-3">
      <ViewSwitcher />
      <motion.span
        variants={variants}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.94 }}
        className="inline-flex"
      >
        <InterviewerLocaleSwitcher />
      </motion.span>
      <motion.span
        variants={variants}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.94 }}
        className="inline-flex"
      >
        <FeedbackPopover
          {...feedback}
          display="icon"
          variant="glass"
          color="default"
          size={TOP_BAR_SIZE}
          className="border-outline"
        />
      </motion.span>
      {showLock && (
        <motion.span
          variants={variants}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.94 }}
          className="inline-flex"
        >
          <IconButton
            variant="glass"
            size={TOP_BAR_SIZE}
            icon={<Lock size={22} className="stroke-[3px]" aria-hidden />}
            aria-label={intl.formatMessage(messages.lockApp)}
            onClick={onLock}
            className="border-outline"
          />
        </motion.span>
      )}
      <motion.span
        variants={variants}
        whileHover={{ y: -2, rotate: -8 }}
        whileTap={{ scale: 0.94 }}
        className="inline-flex"
      >
        <IconButton
          variant="glass"
          size={TOP_BAR_SIZE}
          icon={<Settings size={22} className="stroke-[3px]" aria-hidden />}
          aria-label={intl.formatMessage(messages.settings)}
          onClick={onOpenSettings}
          className="border-outline"
          data-testid="settings-trigger"
        />
      </motion.span>
    </div>
  );
}

type TopActionBarProps = {
  onOpenSettings: () => void;
};

export function TopActionBar({ onOpenSettings }: TopActionBarProps) {
  const { mode, lock } = useAuth();
  const { track } = useAnalytics();
  const showLock = mode !== undefined && mode !== 'none';

  return (
    <TopActionBarView
      // Opening the form is usage, which `track` reports only with analytics
      // on. What the user writes and sends always goes out, anonymously.
      feedback={appFeedbackSurvey(track, sendFeedbackEvent)}
      showLock={showLock}
      onLock={() => {
        void lock();
      }}
      onOpenSettings={onOpenSettings}
    />
  );
}
