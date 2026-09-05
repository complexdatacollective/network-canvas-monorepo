import { defineMessages } from '@codaco/app-i18n/messages';
import SettingsCard from '~/components/settings/SettingsCard';
import SettingsField from '~/components/settings/SettingsField';
import { getServerIntl } from '~/i18n/server';

import RecruitmentTestSectionServer from '../../_components/RecruitmentTestSectionServer';
import ResetButton from '../../_components/ResetButton';

const messages = defineMessages({
  developerTools: {
    id: 'fresco.settings.DeveloperToolsSection.developerTools',
    defaultMessage: 'Developer Tools',
    description:
      'Researcher-facing settings / DeveloperToolsSection: Developer Tools',
  },
  resetSettings: {
    id: 'fresco.settings.DeveloperToolsSection.resetSettings',
    defaultMessage: 'Reset Settings',
    description:
      'Researcher-facing settings / DeveloperToolsSection: Reset Settings',
  },
  deleteAllDataAndResetFrescoTo: {
    id: 'fresco.settings.DeveloperToolsSection.deleteAllDataAndResetFrescoTo',
    defaultMessage: 'Delete all data and reset Fresco to its default state.',
    description:
      'Researcher-facing settings / DeveloperToolsSection: Delete all data and reset Fresco to its default state.',
  },
});

export default async function DeveloperToolsSection() {
  const intl = await getServerIntl();

  return (
    <SettingsCard
      id="developer-tools"
      title={intl.formatMessage(messages.developerTools)}
      variant="destructive"
      divideChildren
    >
      <SettingsField
        label={intl.formatMessage(messages.resetSettings)}
        description={intl.formatMessage(messages.deleteAllDataAndResetFrescoTo)}
        control={<ResetButton />}
      />
      <RecruitmentTestSectionServer />
    </SettingsCard>
  );
}
