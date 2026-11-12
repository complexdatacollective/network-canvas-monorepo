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
    description: 'Heading of the Privacy card on the Settings page.',
  },
  disableAnalytics: {
    id: 'fresco.settings.PrivacySection.disableAnalytics',
    defaultMessage: 'Disable Analytics',
    description:
      'Label and accessible name of the toggle in the Privacy card of Settings that turns off sending anonymous usage analytics. Disable is a verb.',
  },
  ifThisOptionIsEnabledNoAnonymous: {
    id: 'fresco.settings.PrivacySection.ifThisOptionIsEnabledNoAnonymous',
    defaultMessage:
      'If this option is enabled, no anonymous analytics data will be sent to the Network Canvas team.',
    description:
      'Description under the Disable Analytics toggle in the Privacy card of Settings. This option refers to that toggle.',
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
