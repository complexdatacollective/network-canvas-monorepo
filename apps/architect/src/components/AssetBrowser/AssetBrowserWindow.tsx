import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';

import AssetBrowser from './AssetBrowser';
const messages = defineMessages({
  resourceBrowser: {
    id: 'architect.assetBrowser.assetBrowserWindow.resourceBrowser',
    defaultMessage: 'Resource Browser',
    description:
      'The title text in components / AssetBrowser / AssetBrowserWindow.',
  },
});

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
  const intl = useAppIntl();
  return (
    <Dialog
      open={show}
      closeDialog={onCancel}
      title={intl.formatMessage(messages.resourceBrowser)}
      size="workspace"
      footer={
        <Button color="default" onClick={onCancel}>
          {intl.formatMessage(commonMessages.cancel)}
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
