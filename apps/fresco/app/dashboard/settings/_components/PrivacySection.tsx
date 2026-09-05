import { Suspense } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { ToggleFieldSkeleton } from '@codaco/fresco-ui/form/fields/ToggleFieldSkeleton';
import DisableAnalyticsSwitch from '~/components/DisableAnalyticsSwitch';
import SettingsCard from '~/components/settings/SettingsCard';
import SettingsField from '~/components/settings/SettingsField';
import { env } from '~/env';
import { getServerIntl } from '~/i18n/server';

import ReadOnlyEnvAlert from '../ReadOnlyEnvAlert';

const messages = defineMessages({
  privacy: {
    id: 'fresco.settings.PrivacySection.privacy',
    defaultMessage: 'Privacy',
    description: 'Researcher-facing settings / PrivacySection: Privacy',
  },
  disableAnalytics: {
    id: 'fresco.settings.PrivacySection.disableAnalytics',
    defaultMessage: 'Disable Analytics',
    description:
      'Researcher-facing settings / PrivacySection: Disable Analytics',
  },
  ifThisOptionIsEnabledNoAnonymous: {
    id: 'fresco.settings.PrivacySection.ifThisOptionIsEnabledNoAnonymous',
    defaultMessage:
      'If this option is enabled, no anonymous analytics data will be sent to the Network Canvas team.',
    description:
      'Researcher-facing settings / PrivacySection: If this option is enabled, no anonymous analytics data will be sent to the Network Canvas team.',
  },
});

export default async function PrivacySection() {
  const intl = await getServerIntl();

  return (
    <SettingsCard
      id="privacy"
      title={intl.formatMessage(messages.privacy)}
      divideChildren
    >
      <SettingsField
        label={intl.formatMessage(messages.disableAnalytics)}
        testId="disable-analytics-field"
        description={intl.formatMessage(
          messages.ifThisOptionIsEnabledNoAnonymous,
        )}
        control={
          <Suspense fallback={<ToggleFieldSkeleton />}>
            <DisableAnalyticsSwitch
              label={intl.formatMessage(messages.disableAnalytics)}
            />
          </Suspense>
        }
      >
        {!!env.DISABLE_ANALYTICS && <ReadOnlyEnvAlert />}
      </SettingsField>
    </SettingsCard>
  );
}
