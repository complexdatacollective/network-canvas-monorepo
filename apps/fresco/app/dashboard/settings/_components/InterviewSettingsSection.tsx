import { type ReactNode, Suspense } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import { ToggleFieldSkeleton } from '@codaco/fresco-ui/form/fields/ToggleFieldSkeleton';
import AnonymousRecruitmentSwitch from '~/components/AnonymousRecruitmentSwitch';
import FreezeInterviewsSwitch from '~/components/FreezeInterviewsSwitch';
import InteractionSoundsSwitch from '~/components/InteractionSoundsSwitch';
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
      'If this option is enabled, each participant can only have one <strong>completed</strong> interview for each protocol, although they may have multiple incomplete interviews. Once an interview is completed, starting a new interview or resuming any other incomplete interview is prevented.',
    description:
      'Explains the completed-interview limit and that completion prevents both starting another interview and resuming any other incomplete interview.',
  },

  interviewSettings: {
    id: 'fresco.settings.InterviewSettingsSection.interviewSettings',
    defaultMessage: 'Interview Settings',
    description:
      'Title of the card in Settings that groups options controlling how participants take interviews.',
  },
  anonymousRecruitment: {
    id: 'fresco.settings.InterviewSettingsSection.anonymousRecruitment',
    defaultMessage: 'Anonymous Recruitment',
    description:
      "Label of the toggle in Interview Settings that allows anonymous recruitment, where study participants join through a shared link. Also the toggle's accessible name.",
  },
  ifAnonymousRecruitmentIsEnabledYouMay: {
    id: 'fresco.settings.InterviewSettingsSection.ifAnonymousRecruitmentIsEnabledYouMay',
    defaultMessage:
      'If anonymous recruitment is enabled, you may generate an anonymous participation URL. This URL can be shared with participants to allow them to self-enroll in your study.',
    description:
      'Hint under the anonymous recruitment toggle in Interview Settings, explaining that enabling it lets the researcher generate one shared link that participants use to enrol themselves.',
  },
  limitInterviews: {
    id: 'fresco.settings.InterviewSettingsSection.limitInterviews',
    defaultMessage: 'Limit Interviews',
    description:
      "Label of the toggle in Interview Settings that limits each participant to one completed interview per protocol. Also the toggle's accessible name.",
  },

  freezeCompletedInterviews: {
    id: 'fresco.settings.InterviewSettingsSection.freezeCompletedInterviews',
    defaultMessage: 'Freeze Completed Interviews',
    description:
      "Label of the toggle in Interview Settings that stops completed interviews from accepting further changes. Freeze means lock. Also the toggle's accessible name.",
  },
  whenEnabledCompletedInterviewsWillSilentlyReject: {
    id: 'fresco.settings.InterviewSettingsSection.whenEnabledCompletedInterviewsWillSilentlyReject',
    defaultMessage:
      'When enabled, completed interviews will silently reject any further data sync updates. This prevents modifications to submitted data if an interview is re-opened.',
    description:
      'Hint under the freeze completed interviews toggle in Interview Settings. Data sync updates are the automatic saves a browser sends while an interview is open.',
  },
  playSoundsDuringInterviews: {
    id: 'fresco.settings.InterviewSettingsSection.playSoundsDuringInterviews',
    defaultMessage: 'Play Sounds During Interviews',
    description:
      "Label of the toggle in Interview Settings that controls whether participants' devices play short sounds while they take an interview. Off by default. Also the toggle's accessible name. English uses title case for these labels; follow the usual capitalisation of your language.",
  },
  ifThisOptionIsEnabledShortSoundsPlay: {
    id: 'fresco.settings.InterviewSettingsSection.ifThisOptionIsEnabledShortSoundsPlay',
    defaultMessage:
      'If this option is enabled, short sounds play when participants change their network, choose an answer, move between stages or try to submit a form that has errors, and when the interview ends.',
    description:
      'Hint under the Play Sounds During Interviews toggle in Interview Settings; lists the moments in an interview when a sound plays. Changing their network means adding, removing, connecting or highlighting the people or other entries in the participant\'s network, sorting them into categories, or placing them on a sociogram. Choosing an answer means selecting an option, ticking or unticking a box, or turning a toggle on or off in a question. Moving between stages means going to the next or previous screen with the Back or Next button. A form has errors when a required answer is missing or an answer is not valid. Interviewer shows the same sentence without "If this option is enabled,"; keep the two translations the same, including the words for "choose an answer".',
  },
  disableSmallScreenWarning: {
    id: 'fresco.settings.InterviewSettingsSection.disableSmallScreenWarning',
    defaultMessage: 'Disable Small Screen Warning',
    description:
      "Label of the toggle in Interview Settings that hides the warning participants get when they open an interview on a small screen. Also the toggle's accessible name.",
  },
  ifThisOptionIsEnabledTheWarning: {
    id: 'fresco.settings.InterviewSettingsSection.ifThisOptionIsEnabledTheWarning',
    defaultMessage:
      'If this option is enabled, the warning about using Fresco on a small screen will be disabled.',
    description:
      'Hint under the disable small screen warning toggle in Interview Settings. Fresco is the product name and is not translated.',
  },
  ensureThatYouTestYourInterviewThoroughly: {
    id: 'fresco.settings.InterviewSettingsSection.ensureThatYouTestYourInterviewThoroughly',
    defaultMessage:
      'Ensure that you test your interview thoroughly on a small screen when disabling this warning. Fresco is designed to work best on larger screens, and using it on a small screen may lead to a poor user experience for participants.',
    description:
      'Warning alert shown in Interview Settings once the small screen warning is switched off, advising the researcher to test on small screens. Fresco is the product name.',
  },
});

const renderStrongChunks = (chunks: ReactNode[]) => <strong>{chunks}</strong>;

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
          strong: renderStrongChunks,
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
        label={intl.formatMessage(messages.playSoundsDuringInterviews)}
        testId="interaction-sounds-field"
        description={intl.formatMessage(
          messages.ifThisOptionIsEnabledShortSoundsPlay,
        )}
        control={
          <Suspense fallback={<ToggleFieldSkeleton />}>
            <InteractionSoundsSwitch
              label={intl.formatMessage(messages.playSoundsDuringInterviews)}
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
