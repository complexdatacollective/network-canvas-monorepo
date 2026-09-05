import 'server-only';
import { setAppSetting } from '~/actions/appSettings';
import { getAppSetting } from '~/queries/appSettings';

import Switch from './SwitchWithOptimisticUpdate';

const FreezeInterviewsSwitch = async ({ label }: { label: string }) => {
  const freezeInterviewsAfterCompletion = await getAppSetting(
    'freezeInterviewsAfterCompletion',
  );

  if (freezeInterviewsAfterCompletion === null) {
    return null;
  }

  return (
    <Switch
      label={label}
      initialValue={freezeInterviewsAfterCompletion}
      updateValue={async (value) => {
        'use server';
        await setAppSetting('freezeInterviewsAfterCompletion', value);
        return value;
      }}
    />
  );
};

export default FreezeInterviewsSwitch;
