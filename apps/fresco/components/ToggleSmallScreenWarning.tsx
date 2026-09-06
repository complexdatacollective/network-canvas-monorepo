import { setAppSetting } from '~/actions/appSettings';
import { getAppSetting } from '~/queries/appSettings';

import SwitchWithOptimisticUpdate from './SwitchWithOptimisticUpdate';

const ToggleSmallScreenWarning = async ({ label }: { label: string }) => {
  const disableSmallScreenOverlay = await getAppSetting(
    'disableSmallScreenOverlay',
  );

  return (
    <SwitchWithOptimisticUpdate
      label={label}
      initialValue={disableSmallScreenOverlay}
      updateValue={async (value) => {
        'use server';
        await setAppSetting('disableSmallScreenOverlay', value);
        return value;
      }}
    />
  );
};

export default ToggleSmallScreenWarning;
