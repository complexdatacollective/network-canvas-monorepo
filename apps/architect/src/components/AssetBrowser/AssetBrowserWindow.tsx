import { Layout } from '~/components/EditorLayout';
import { Button } from '~/lib/legacy-ui/components';

import Dialog from '../NewComponents/Dialog';
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
      onOpenChange={(open) => !open && onCancel()}
      title="Resource Browser"
      footer={
        <Dialog.Close
          nativeButton={false}
          render={<Button color="platinum">Cancel</Button>}
        />
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
