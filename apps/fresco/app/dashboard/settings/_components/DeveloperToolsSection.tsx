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
      'Title of the Developer Tools card in Settings, which holds the destructive reset and the recruitment test. Shown in a red, destructive style.',
  },
  resetSettings: {
    id: 'fresco.settings.DeveloperToolsSection.resetSettings',
    defaultMessage: 'Reset Settings',
    description:
      'Label of the field in the Developer Tools card of Settings that holds the reset button; the hint below it explains the reset deletes everything.',
  },
  deleteAllDataAndResetFrescoTo: {
    id: 'fresco.settings.DeveloperToolsSection.deleteAllDataAndResetFrescoTo',
    defaultMessage: 'Delete all data and reset Fresco to its default state.',
    description:
      'Warning hint under the Reset Settings label in the Developer Tools card of Settings; describes what the reset button next to it does: erases all data on this installation.',
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
