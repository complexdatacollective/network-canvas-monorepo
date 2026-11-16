import { Suspense } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import SettingsCard from '~/components/settings/SettingsCard';
import SettingsField from '~/components/settings/SettingsField';
import VersionSection, {
  VersionSectionSkeleton,
} from '~/components/VersionSection';
import { env } from '~/env';
import { getServerIntl } from '~/i18n/server';
import { getInstallationId } from '~/queries/appSettings';

import UpdateInstallationId from './UpdateInstallationId';

const messages = defineMessages({
  appDetails: {
    id: 'fresco.settings.ConfigurationSection.appDetails',
    defaultMessage: 'App Details',
    description:
      'Title of the settings card that shows the installed Fresco version and the installation ID. Also the name of this section in the Settings page.',
  },
  installationID: {
    id: 'fresco.settings.ConfigurationSection.installationID',
    defaultMessage: 'Installation ID',
    description:
      'Label of the field in Settings, App Details, that holds the unique identifier of this Fresco installation. Also its accessible name. ID is short for identifier.',
  },
  thisIsTheUniqueIdentifierForYour: {
    id: 'fresco.settings.ConfigurationSection.thisIsTheUniqueIdentifierForYour',
    defaultMessage:
      'This is the unique identifier for your installation of Fresco. This ID is used to track analytics data and for other internal purposes.',
    description:
      'Hint text under the Installation ID field in Settings, App Details, explaining what the identifier is used for.',
  },
});

export default async function ConfigurationSection() {
  const intl = await getServerIntl();

  const installationId = await getInstallationId();

  return (
    <SettingsCard
      id="app-details"
      title={intl.formatMessage(messages.appDetails)}
      divideChildren
    >
      <Suspense fallback={<VersionSectionSkeleton />}>
        <VersionSection />
      </Suspense>
      <SettingsField
        label={intl.formatMessage(messages.installationID)}
        description={intl.formatMessage(
          messages.thisIsTheUniqueIdentifierForYour,
        )}
      >
        <UpdateInstallationId
          label={intl.formatMessage(messages.installationID)}
          installationId={installationId ?? undefined}
          readOnly={!!env.INSTALLATION_ID}
        />
      </SettingsField>
    </SettingsCard>
  );
}
