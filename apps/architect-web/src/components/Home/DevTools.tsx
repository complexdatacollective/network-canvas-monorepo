import ActionToolbar from '~/components/ProjectNav/ActionToolbar';
import { DEVELOPMENT_PROTOCOL_URL } from '~/config';
import { useAppDispatch } from '~/ducks/hooks';
import { openRemoteNetcanvas } from '~/ducks/modules/userActions/userActions';
import Button from '~/lib/legacy-ui/components/Button';
import { clearAllStorage } from '~/utils/assetDB';

type DevToolsProps = {
  runAction: (action: () => Promise<unknown>) => Promise<void>;
};

const DevTools = ({ runAction }: DevToolsProps) => {
  const dispatch = useAppDispatch();

  if (!import.meta.env.DEV) return null;

  const installDevelopmentProtocol = () =>
    runAction(async () => {
      await dispatch(openRemoteNetcanvas(DEVELOPMENT_PROTOCOL_URL));
    });

  return (
    <ActionToolbar aria-label="Development tools">
      <span className="small-heading px-2">Dev</span>
      <Button color="platinum" onClick={installDevelopmentProtocol}>
        Install development protocol
      </Button>
      <Button color="tomato" onClick={clearAllStorage}>
        Clear all data
      </Button>
    </ActionToolbar>
  );
};

export default DevTools;
