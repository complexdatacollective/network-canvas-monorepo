import { Suspense } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { ToggleFieldSkeleton } from '@codaco/fresco-ui/form/fields/ToggleFieldSkeleton';
import ApiTokenManagement from '~/components/ApiTokenManagement';
import InterviewDataApiSwitch from '~/components/InterviewDataApiSwitch';
import SettingsCard from '~/components/settings/SettingsCard';
import SettingsField from '~/components/settings/SettingsField';
import { getServerIntl } from '~/i18n/server';
import { getApiTokens } from '~/queries/apiTokens';

const messages = defineMessages({
  aPITokens: {
    id: 'fresco.settings.ApiTokensSection.aPITokens',
    defaultMessage: 'API Tokens',
    description: 'Researcher-facing settings / ApiTokensSection: API Tokens',
  },
  interviewDataAPI: {
    id: 'fresco.settings.ApiTokensSection.interviewDataAPI',
    defaultMessage: 'Interview Data API',
    description:
      'Researcher-facing settings / ApiTokensSection: Interview Data API',
  },
  enableAReadOnlyAPIForAccessing: {
    id: 'fresco.settings.ApiTokensSection.enableAReadOnlyAPIForAccessing',
    defaultMessage:
      'Enable a read-only API for accessing interview data. Requires an API token for authentication.',
    description:
      'Researcher-facing settings / ApiTokensSection: Enable a read-only API for accessing interview data. Requires an API token for authentication.',
  },
  manageTokens: {
    id: 'fresco.settings.ApiTokensSection.manageTokens',
    defaultMessage: 'Manage Tokens',
    description: 'Researcher-facing settings / ApiTokensSection: Manage Tokens',
  },
  aPITokensAreUsedToAuthenticateRequests: {
    id: 'fresco.settings.ApiTokensSection.aPITokensAreUsedToAuthenticateRequests',
    defaultMessage:
      'API tokens are used to authenticate requests to the Interview Data API.',
    description:
      'Researcher-facing settings / ApiTokensSection: API tokens are used to authenticate requests to the Interview Data API.',
  },
});

export default async function ApiTokensSection() {
  const intl = await getServerIntl();

  const apiTokensPromise = getApiTokens();

  return (
    <SettingsCard
      id="api-tokens"
      title={intl.formatMessage(messages.aPITokens)}
      divideChildren
    >
      <SettingsField
        label={intl.formatMessage(messages.interviewDataAPI)}
        testId="interview-data-api-field"
        description={intl.formatMessage(
          messages.enableAReadOnlyAPIForAccessing,
        )}
        control={
          <Suspense fallback={<ToggleFieldSkeleton />}>
            <InterviewDataApiSwitch
              label={intl.formatMessage(messages.interviewDataAPI)}
            />
          </Suspense>
        }
      />
      <SettingsField
        label={intl.formatMessage(messages.manageTokens)}
        testId="manage-api-tokens-field"
        description={intl.formatMessage(
          messages.aPITokensAreUsedToAuthenticateRequests,
        )}
      >
        <ApiTokenManagement tokensPromise={apiTokensPromise} />
      </SettingsField>
    </SettingsCard>
  );
}
