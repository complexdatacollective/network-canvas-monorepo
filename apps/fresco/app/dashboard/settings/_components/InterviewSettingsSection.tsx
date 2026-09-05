import { Suspense } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import { ToggleFieldSkeleton } from '@codaco/fresco-ui/form/fields/ToggleFieldSkeleton';
import AnonymousRecruitmentSwitch from '~/components/AnonymousRecruitmentSwitch';
import FreezeInterviewsSwitch from '~/components/FreezeInterviewsSwitch';
import LimitInterviewsSwitch from '~/components/LimitInterviewsSwitch';
import SettingsCard from '~/components/settings/SettingsCard';
import SettingsField from '~/components/settings/SettingsField';
import ToggleSmallScreenWarning from '~/components/ToggleSmallScreenWarning';
import { getServerIntl } from '~/i18n/server';
import { getAppSetting } from '~/queries/appSettings';

const messages = defineMessages({
  completedLimit: {
    id: 'fresco.settings.interviews.completedLimit',
    defaultMessage:
      'If this option is enabled, each participant can only have one <strong>completed</strong> interview for each protocol, although they may have multiple incomplete interviews.',
    description:
      'Explains the limit on completed interviews while preserving incomplete interviews.',
  },

  interviewSettings: {
    id: 'fresco.settings.InterviewSettingsSection.interviewSettings',
    defaultMessage: 'Interview Settings',
    description:
      'Researcher-facing settings / InterviewSettingsSection: Interview Settings',
  },
  anonymousRecruitment: {
    id: 'fresco.settings.InterviewSettingsSection.anonymousRecruitment',
    defaultMessage: 'Anonymous Recruitment',
    description:
      'Researcher-facing settings / InterviewSettingsSection: Anonymous Recruitment',
  },
  ifAnonymousRecruitmentIsEnabledYouMay: {
    id: 'fresco.settings.InterviewSettingsSection.ifAnonymousRecruitmentIsEnabledYouMay',
    defaultMessage:
      'If anonymous recruitment is enabled, you may generate an anonymous participation URL. This URL can be shared with participants to allow them to self-enroll in your study.',
    description:
      'Researcher-facing settings / InterviewSettingsSection: If anonymous recruitment is enabled, you may generate an anonymous participation URL. This URL can be shared with partic',
  },
  limitInterviews: {
    id: 'fresco.settings.InterviewSettingsSection.limitInterviews',
    defaultMessage: 'Limit Interviews',
    description:
      'Researcher-facing settings / InterviewSettingsSection: Limit Interviews',
  },

  freezeCompletedInterviews: {
    id: 'fresco.settings.InterviewSettingsSection.freezeCompletedInterviews',
    defaultMessage: 'Freeze Completed Interviews',
    description:
      'Researcher-facing settings / InterviewSettingsSection: Freeze Completed Interviews',
  },
  whenEnabledCompletedInterviewsWillSilentlyReject: {
    id: 'fresco.settings.InterviewSettingsSection.whenEnabledCompletedInterviewsWillSilentlyReject',
    defaultMessage:
      'When enabled, completed interviews will silently reject any further data sync updates. This prevents modifications to submitted data if an interview is re-opened.',
    description:
      'Researcher-facing settings / InterviewSettingsSection: When enabled, completed interviews will silently reject any further data sync updates. This prevents modifications to su',
  },
  disableSmallScreenWarning: {
    id: 'fresco.settings.InterviewSettingsSection.disableSmallScreenWarning',
    defaultMessage: 'Disable Small Screen Warning',
    description:
      'Researcher-facing settings / InterviewSettingsSection: Disable Small Screen Warning',
  },
  ifThisOptionIsEnabledTheWarning: {
    id: 'fresco.settings.InterviewSettingsSection.ifThisOptionIsEnabledTheWarning',
    defaultMessage:
      'If this option is enabled, the warning about using Fresco on a small screen will be disabled.',
    description:
      'Researcher-facing settings / InterviewSettingsSection: If this option is enabled, the warning about using Fresco on a small screen will be disabled.',
  },
  ensureThatYouTestYourInterviewThoroughly: {
    id: 'fresco.settings.InterviewSettingsSection.ensureThatYouTestYourInterviewThoroughly',
    defaultMessage:
      'Ensure that you test your interview thoroughly on a small screen when disabling this warning. Fresco is designed to work best on larger screens, and using it on a small screen may lead to a poor user experience for participants.',
    description:
      'Researcher-facing settings / InterviewSettingsSection: Ensure that you test your interview thoroughly on a small screen when disabling this warning. Fresco is designed to work',
  },
});

export default async function InterviewSettingsSection() {
  const intl = await getServerIntl();

  const disableSmallScreenOverlay = await getAppSetting(
    'disableSmallScreenOverlay',
  );

  return (
    <SettingsCard
      id="interview-settings"
      title={intl.formatMessage(messages.interviewSettings)}
      divideChildren
    >
      <SettingsField
        label={intl.formatMessage(messages.anonymousRecruitment)}
        description={intl.formatMessage(
          messages.ifAnonymousRecruitmentIsEnabledYouMay,
        )}
        testId="anonymous-recruitment-field"
        control={
          <Suspense fallback={<ToggleFieldSkeleton />}>
            <AnonymousRecruitmentSwitch
              label={intl.formatMessage(messages.anonymousRecruitment)}
            />
          </Suspense>
        }
      />
      <SettingsField
        label={intl.formatMessage(messages.limitInterviews)}
        testId="limit-interviews-field"
        description={intl.formatMessage(messages.completedLimit, {
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
        control={
          <Suspense fallback={<ToggleFieldSkeleton />}>
            <LimitInterviewsSwitch
              label={intl.formatMessage(messages.limitInterviews)}
            />
          </Suspense>
        }
      />
      <SettingsField
        label={intl.formatMessage(messages.freezeCompletedInterviews)}
        testId="freeze-interviews-field"
        description={intl.formatMessage(
          messages.whenEnabledCompletedInterviewsWillSilentlyReject,
        )}
        control={
          <Suspense fallback={<ToggleFieldSkeleton />}>
            <FreezeInterviewsSwitch
              label={intl.formatMessage(messages.freezeCompletedInterviews)}
            />
          </Suspense>
        }
      />
      <SettingsField
        label={intl.formatMessage(messages.disableSmallScreenWarning)}
        description={intl.formatMessage(
          messages.ifThisOptionIsEnabledTheWarning,
        )}
        control={
          <Suspense fallback={<ToggleFieldSkeleton />}>
            <ToggleSmallScreenWarning
              label={intl.formatMessage(messages.disableSmallScreenWarning)}
            />
          </Suspense>
        }
      >
        {disableSmallScreenOverlay && (
          <Alert variant="warning">
            <AlertDescription>
              {intl.formatMessage(
                messages.ensureThatYouTestYourInterviewThoroughly,
              )}
            </AlertDescription>
          </Alert>
        )}
      </SettingsField>
    </SettingsCard>
  );
}
