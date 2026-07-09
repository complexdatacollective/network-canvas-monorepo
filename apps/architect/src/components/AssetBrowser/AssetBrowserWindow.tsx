import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import { Layout } from '~/components/EditorLayout';

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
      footer={
        <Button color="default" onClick={onCancel}>
          Cancel
        </Button>
      }
    >
      <Layout>
        <AssetBrowser
          type={type}
          onSelect={onSelect}
          selected={selected}
          disableDelete
          sectionLayout="vertical"
        />
      </Layout>
    </Dialog>
  );
};

export default AssetBrowserWindow;
