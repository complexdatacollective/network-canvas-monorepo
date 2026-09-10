import 'server-only';
import { setAppSetting } from '~/actions/appSettings';
import { getAppSetting } from '~/queries/appSettings';

import Switch from './SwitchWithOptimisticUpdate';

const LimitInterviewsSwitch = async ({ label }: { label: string }) => {
  const limitInterviews = await getAppSetting('limitInterviews');

  if (limitInterviews === null) {
    return null;
  }

  return (
    <Switch
      label={label}
      initialValue={limitInterviews}
      updateValue={async (value) => {
        'use server';
        await setAppSetting('limitInterviews', value);
        return value;
      }}
    />
  );
};

export default LimitInterviewsSwitch;
