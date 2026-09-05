import { setAppSetting } from '~/actions/appSettings';
import { getAppSetting } from '~/queries/appSettings';

import SwitchWithOptimisticUpdate from './SwitchWithOptimisticUpdate';

const AnonymousRecruitmentSwitch = async ({ label }: { label: string }) => {
  const allowAnonymousRecruitment = await getAppSetting(
    'allowAnonymousRecruitment',
  );

  if (allowAnonymousRecruitment === null) {
    return null;
  }

  return (
    <SwitchWithOptimisticUpdate
      label={label}
      initialValue={allowAnonymousRecruitment}
      updateValue={async (value) => {
        'use server';
        await setAppSetting('allowAnonymousRecruitment', value);
        return value;
      }}
    />
  );
};

export default AnonymousRecruitmentSwitch;
