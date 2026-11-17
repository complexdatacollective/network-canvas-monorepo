import { Suspense } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import SettingsField from '~/components/settings/SettingsField';
import { getServerIntl } from '~/i18n/server';
import { getAppSetting } from '~/queries/appSettings';
import { getParticipantsForSelect } from '~/queries/participants';
import { getProtocols } from '~/queries/protocols';

import RecruitmentTestSection from './RecruitmentTestSection';

const messages = defineMessages({
  recruitmentTest: {
    id: 'fresco.RecruitmentTestSectionServer.recruitmentTest',
    defaultMessage: 'Recruitment Test',
    description:
      'Label of a field in the Developer Tools section of Settings; the field lets the researcher open a test interview as if a participant had followed a recruitment link.',
  },
  thisSectionAllowsYouToTestRecruitment: {
    id: 'fresco.RecruitmentTestSectionServer.thisSectionAllowsYouToTestRecruitment',
    defaultMessage: 'This section allows you to test recruitment.',
    description:
      'Hint under the Recruitment Test label in the Developer Tools section of Settings; the controls below start a test interview for a chosen protocol and participant.',
  },
});

export default async function RecruitmentTestSectionServer() {
  const intl = await getServerIntl();

  const protocolsPromise = getProtocols();
  const participantsPromise = getParticipantsForSelect();
  const allowAnonymousRecruitmentPromise = getAppSetting(
    'allowAnonymousRecruitment',
  );

  return (
    <SettingsField
      label={intl.formatMessage(messages.recruitmentTest)}
      description={intl.formatMessage(
        messages.thisSectionAllowsYouToTestRecruitment,
      )}
    >
      <Suspense fallback={intl.formatMessage(commonMessages.loading)}>
        <RecruitmentTestSection
          protocolsPromise={protocolsPromise}
          participantsPromise={participantsPromise}
          allowAnonymousRecruitmentPromise={allowAnonymousRecruitmentPromise}
        />
      </Suspense>
    </SettingsField>
  );
}
