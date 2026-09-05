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
      'Researcher-facing settings / ConfigurationSection: App Details',
  },
  installationID: {
    id: 'fresco.settings.ConfigurationSection.installationID',
    defaultMessage: 'Installation ID',
    description:
      'Researcher-facing settings / ConfigurationSection: Installation ID',
  },
  thisIsTheUniqueIdentifierForYour: {
    id: 'fresco.settings.ConfigurationSection.thisIsTheUniqueIdentifierForYour',
    defaultMessage:
      'This is the unique identifier for your installation of Fresco. This ID is used to track analytics data and for other internal purposes.',
    description:
      'Researcher-facing settings / ConfigurationSection: This is the unique identifier for your installation of Fresco. This ID is used to track analytics data and for other int',
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
