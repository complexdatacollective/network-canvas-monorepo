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
    description:
      'Title of the card in Settings that holds the interview data API switch and the list of API tokens.',
  },
  interviewDataAPI: {
    id: 'fresco.settings.ApiTokensSection.interviewDataAPI',
    defaultMessage: 'Interview Data API',
    description:
      "Label of the toggle in the API Tokens card of Settings that turns the read-only API for interview data on or off. Also the toggle's accessible name.",
  },
  enableAReadOnlyAPIForAccessing: {
    id: 'fresco.settings.ApiTokensSection.enableAReadOnlyAPIForAccessing',
    defaultMessage:
      'Enable a read-only API for accessing interview data. Requires an API token for authentication.',
    description:
      'Hint under the interview data API toggle in Settings. The API token is a secret that programs send to prove they may read interview data.',
  },
  manageTokens: {
    id: 'fresco.settings.ApiTokensSection.manageTokens',
    defaultMessage: 'Manage Tokens',
    description:
      'Label of the Settings row where the researcher creates and revokes API tokens for the interview data API. Tokens here are API tokens, not two-factor codes.',
  },
  aPITokensAreUsedToAuthenticateRequests: {
    id: 'fresco.settings.ApiTokensSection.aPITokensAreUsedToAuthenticateRequests',
    defaultMessage:
      'API tokens are used to authenticate requests to the Interview Data API.',
    description:
      'Hint under the Manage Tokens label in Settings, explaining what API tokens are for.',
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
