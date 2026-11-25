import 'server-only';
import { setAppSetting } from '~/actions/appSettings';
import { getAppSetting } from '~/queries/appSettings';

import Switch from './SwitchWithOptimisticUpdate';

const InteractionSoundsSwitch = async ({ label }: { label: string }) => {
  const interactionSounds = await getAppSetting('interactionSounds');

  return (
    <Switch
      label={label}
      initialValue={interactionSounds}
      updateValue={async (value) => {
        'use server';
        await setAppSetting('interactionSounds', value);
        return value;
      }}
    />
  );
};

export default InteractionSoundsSwitch;
