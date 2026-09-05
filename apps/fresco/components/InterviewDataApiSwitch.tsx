import 'server-only';
import { setAppSetting } from '~/actions/appSettings';
import Switch from '~/components/SwitchWithOptimisticUpdate';
import { getAppSetting } from '~/queries/appSettings';

const InterviewDataApiSwitch = async ({ label }: { label: string }) => {
  const enableInterviewDataApi = await getAppSetting('enableInterviewDataApi');

  if (enableInterviewDataApi === null) {
    return null;
  }

  return (
    <Switch
      label={label}
      initialValue={enableInterviewDataApi}
      updateValue={async (value) => {
        'use server';
        await setAppSetting('enableInterviewDataApi', value);
        return value;
      }}
    />
  );
};

export default InterviewDataApiSwitch;
