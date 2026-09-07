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
      'Researcher-facing RecruitmentTestSectionServer: Recruitment Test',
  },
  thisSectionAllowsYouToTestRecruitment: {
    id: 'fresco.RecruitmentTestSectionServer.thisSectionAllowsYouToTestRecruitment',
    defaultMessage: 'This section allows you to test recruitment.',
    description:
      'Researcher-facing RecruitmentTestSectionServer: This section allows you to test recruitment.',
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
