import { setAppSetting } from '~/actions/appSettings';
import SwitchWithOptimisticUpdate from '~/components/SwitchWithOptimisticUpdate';
import { env } from '~/env';
import { getDisableAnalytics } from '~/queries/appSettings';

const DisableAnalyticsSwitch = async ({ label }: { label: string }) => {
  const disableAnalytics = await getDisableAnalytics();
  const readOnly = !!env.DISABLE_ANALYTICS;
  return (
    <SwitchWithOptimisticUpdate
      label={label}
      readOnly={readOnly}
      initialValue={disableAnalytics}
      updateValue={async (value) => {
        'use server';
        await setAppSetting('disableAnalytics', value);
        return value;
      }}
    />
  );
};

export default DisableAnalyticsSwitch;
