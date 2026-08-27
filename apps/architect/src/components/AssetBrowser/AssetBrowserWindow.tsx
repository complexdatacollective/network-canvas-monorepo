import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';

import AssetBrowser from './AssetBrowser';

type AssetBrowserWindowProps = {
  show?: boolean;
  type?: string | null;
  selected?: string | null;
  onCancel?: () => void;
  onSelect?: (assetId: string) => void;
};

const AssetBrowserWindow = ({
  show = true,
  type = null,
  selected = null,
  onCancel = () => {},
  onSelect = (_assetId: string) => {},
}: AssetBrowserWindowProps) => {
  return (
    <Dialog
      open={show}
      closeDialog={onCancel}
      title="Resource Browser"
      size="workspace"
      footer={
        <Button color="default" onClick={onCancel}>
          Cancel
        </Button>
      }
    >
      <div className="pb-2">
        <AssetBrowser
          type={type}
          onSelect={onSelect}
          selected={selected}
          disableDelete
        />
      </div>
    </Dialog>
  );
};

export default AssetBrowserWindow;
