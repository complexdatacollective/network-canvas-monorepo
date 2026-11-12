import { Suspense } from 'react';

import type { IntlShape } from '@codaco/app-i18n/messages';
import { defineMessages } from '@codaco/app-i18n/messages';
import PageHeader from '@codaco/fresco-ui/typography/PageHeader';
import { SettingsCardSkeleton } from '~/components/settings/SettingsCard';
import SettingsNavigation, {
  type SettingsSection,
} from '~/components/settings/SettingsNavigation';
import { env } from '~/env';
import { getServerIntl } from '~/i18n/server';
import { requirePageAuth } from '~/lib/auth/guards';
import { requireAppNotExpired } from '~/queries/appSettings';

import ApiTokensSection from './_components/ApiTokensSection';
import ConfigurationSection from './_components/ConfigurationSection';
import DeveloperToolsSection from './_components/DeveloperToolsSection';
import InterviewSettingsSection from './_components/InterviewSettingsSection';
import PrivacySection from './_components/PrivacySection';
import StorageProviderSection from './_components/StorageProviderSection';
import SyntheticInterviewDataServer from './_components/SyntheticInterviewDataServer';
import UserManagementSection from './_components/UserManagementSection';

const messages = defineMessages({
  developer: {
    id: 'fresco.settings.navigation.developer',
    defaultMessage: 'Developer Tools',
    description:
      'Name of the Developer Tools section in the Settings side navigation, shown in a warning style. It holds risky tools such as deleting data and testing recruitment.',
  },

  synthetic: {
    id: 'fresco.settings.navigation.synthetic',
    defaultMessage: 'Synthetic Interview Data',
    description:
      'Name of the section in the Settings side navigation where a researcher generates fake test interviews (synthetic data) for a protocol.',
  },

  api: {
    id: 'fresco.settings.navigation.api',
    defaultMessage: 'API Tokens',
    description:
      'Name of the section in the Settings side navigation where a researcher creates and deletes API tokens, which authorise programs that read interview data from Fresco.',
  },

  privacy: {
    id: 'fresco.settings.navigation.privacy',
    defaultMessage: 'Privacy',
    description:
      'Name of the Privacy section in the Settings side navigation, which holds privacy options such as analytics.',
  },

  interviews: {
    id: 'fresco.settings.navigation.interviews',
    defaultMessage: 'Interview Settings',
    description:
      'Name of the section in the Settings side navigation for options that change how interviews run, such as limiting interviews and anonymous recruitment.',
  },

  storage: {
    id: 'fresco.settings.navigation.storage',
    defaultMessage: 'Storage',
    description:
      'Name of the section in the Settings side navigation where the researcher sees where uploaded files such as protocol assets are stored.',
  },

  users: {
    id: 'fresco.settings.navigation.users',
    defaultMessage: 'User Management',
    description:
      'Name of the section in the Settings side navigation where researcher accounts are added, removed and given sign-in methods. User means researcher, not participant.',
  },

  appDetails: {
    id: 'fresco.settings.navigation.appDetails',
    defaultMessage: 'App Details',
    description:
      'Name of the section in the Settings side navigation that shows the installed version and installation ID of Fresco.',
  },

  settings: {
    id: 'fresco.settings.page.settings',
    defaultMessage: 'Settings',
    description:
      'Heading of the Settings page of the dashboard, where the researcher configures the Fresco installation.',
  },
  hereYouCanConfigureYourInstallationOf: {
    id: 'fresco.settings.page.hereYouCanConfigureYourInstallationOf',
    defaultMessage: 'Here you can configure your installation of Fresco.',
    description:
      'Subheading under the heading of the Settings page, describing the page. Fresco is the product name; installation is this researcher-hosted copy of it.',
  },
});

function getSettingsSections(intl: IntlShape): SettingsSection[] {
  const sections: SettingsSection[] = [
    { id: 'app-details', title: intl.formatMessage(messages.appDetails) },
    { id: 'user-management', title: intl.formatMessage(messages.users) },
    { id: 'storage', title: intl.formatMessage(messages.storage) },
    {
      id: 'interview-settings',
      title: intl.formatMessage(messages.interviews),
    },
    { id: 'privacy', title: intl.formatMessage(messages.privacy) },
    { id: 'api-tokens', title: intl.formatMessage(messages.api) },
    {
      id: 'synthetic-interview-data',
      title: intl.formatMessage(messages.synthetic),
    },
  ];

  if (env.NODE_ENV === 'development' || !env.SANDBOX_MODE) {
    sections.push({
      id: 'developer-tools',
      title: intl.formatMessage(messages.developer),
      variant: 'destructive',
    });
  }

  return sections;
}

async function SettingsContentSkeleton() {
  const intl = await getServerIntl();
  const sections = getSettingsSections(intl);

  return (
    <div className="mx-auto max-w-full">
      <div className="flex gap-8">
        <SettingsNavigation sections={sections} />
        <div className="min-w-0 flex-1 space-y-6">
          <SettingsCardSkeleton rows={1} />
          <SettingsCardSkeleton rows={2} />
          <SettingsCardSkeleton rows={2} />
          <SettingsCardSkeleton rows={3} />
          <SettingsCardSkeleton rows={1} />
          <SettingsCardSkeleton rows={2} />
          <SettingsCardSkeleton rows={2} />
          {(env.NODE_ENV === 'development' || !env.SANDBOX_MODE) && (
            <SettingsCardSkeleton rows={3} />
          )}
        </div>
      </div>
    </div>
  );
}

export default async function Settings() {
  const intl = await getServerIntl();

  return (
    <>
      <PageHeader
        headerText={intl.formatMessage(messages.settings)}
        subHeaderText={intl.formatMessage(
          messages.hereYouCanConfigureYourInstallationOf,
        )}
        data-testid="settings-page-header"
      />
      <Suspense fallback={<SettingsContentSkeleton />}>
        <SettingsContent />
      </Suspense>
    </>
  );
}

async function SettingsContent() {
  const intl = await getServerIntl();
  await requireAppNotExpired();
  const session = await requirePageAuth();
  const sections = getSettingsSections(intl);

  return (
    <div className="mx-auto max-w-full">
      <div className="flex gap-8">
        <SettingsNavigation sections={sections} />
        <div className="min-w-0 flex-1 space-y-6">
          <Suspense fallback={<SettingsCardSkeleton rows={2} />}>
            <ConfigurationSection />
          </Suspense>
          <Suspense fallback={<SettingsCardSkeleton rows={1} />}>
            <UserManagementSection
              userId={session.user.userId}
              username={session.user.username}
            />
          </Suspense>
          <Suspense fallback={<SettingsCardSkeleton rows={2} />}>
            <StorageProviderSection />
          </Suspense>
          <Suspense fallback={<SettingsCardSkeleton rows={3} />}>
            <InterviewSettingsSection />
          </Suspense>
          <PrivacySection />
          <Suspense fallback={<SettingsCardSkeleton rows={2} />}>
            <ApiTokensSection />
          </Suspense>
          <Suspense fallback={<SettingsCardSkeleton rows={2} />}>
            <SyntheticInterviewDataServer />
          </Suspense>
          {(env.NODE_ENV === 'development' || !env.SANDBOX_MODE) && (
            <DeveloperToolsSection />
          )}
        </div>
      </div>
    </div>
  );
}
