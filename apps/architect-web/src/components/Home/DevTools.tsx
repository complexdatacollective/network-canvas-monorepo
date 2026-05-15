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
    <footer className="bg-surface-3 text-surface-2-foreground flex flex-wrap items-center gap-x-4 gap-y-2 px-8 py-3">
      <span className="small-heading">Dev</span>
      <Button
        color="platinum"
        size="small"
        onClick={installDevelopmentProtocol}
      >
        Install development protocol
      </Button>
      <Button color="tomato" size="small" onClick={clearAllStorage}>
        Clear all data
      </Button>
    </footer>
  );
};

export default DevTools;
