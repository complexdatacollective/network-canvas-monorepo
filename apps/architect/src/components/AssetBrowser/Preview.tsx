import { compose } from '@reduxjs/toolkit';
import { CopyIcon as ContentCopyIcon, DownloadIcon } from 'lucide-react';
import { useCallback } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import APIKey from '~/components/Assets/APIKey';
import Audio from '~/components/Assets/Audio';
import BackgroundImage from '~/components/Assets/BackgroundImage';
import GeoJSON from '~/components/Assets/GeoJSON';
import Network from '~/components/Assets/Network';
import Video from '~/components/Assets/Video';
import withAssetMeta from '~/components/Assets/withAssetMeta';
import withAssetPath from '~/components/Assets/withAssetPath';
const messages = defineMessages({
  closePreview: {
    id: 'architect.assetBrowser.preview.closePreview',
    defaultMessage: 'Close preview',
    description: 'Visible text in components / AssetBrowser / Preview.',
  },
  downloadAsset: {
    id: 'architect.assetBrowser.preview.downloadAsset',
    defaultMessage: 'Download asset',
    description: 'Visible text in components / AssetBrowser / Preview.',
  },
  copyAPIKey: {
    id: 'architect.assetBrowser.preview.copyAPIKey',
    defaultMessage: 'Copy API Key',
    description: 'Visible text in components / AssetBrowser / Preview.',
  },
});
const extraMessages = defineMessages({
  unavailable: {
    id: 'architect.assetBrowser.preview.unavailable',
    defaultMessage: 'No preview available.',
    description: 'Researcher-facing Architect control or feedback.',
  },
});

type AssetMeta = Record<string, unknown> & {
  type?: string;
  name?: string;
  value?: string;
};
const getRenderer = (meta: AssetMeta) => {
  switch (meta.type) {
    case 'image':
      return BackgroundImage;
    case 'audio':
      return ({ id }: { id: string }) => <Audio id={id} controls />;
    case 'video':
      return ({ id }: { id: string }) => <Video id={id} controls />;
    case 'network':
      return Network;
    case 'geojson':
      return GeoJSON;
    case 'apikey':
      return APIKey;
    default:
      return () => (
        <Paragraph>
          <AppMessage message={extraMessages.unavailable} />
        </Paragraph>
      );
  }
};
type PreviewOwnProps = {
  id: string;
  show?: boolean;
  onDownload?: (path: string, meta: AssetMeta) => void;
  onClose?: () => void;
};
type PreviewProps = PreviewOwnProps & {
  meta: AssetMeta;
  assetPath: string;
};
const Preview = ({
  id,
  meta,
  assetPath,
  show = true,
  onDownload = () => {},
  onClose = () => {},
}: PreviewProps) => {
  const intl = useAppIntl();
  const AssetRenderer = getRenderer(meta);
  const handleDownload = useCallback(() => {
    onDownload(assetPath, meta);
  }, [onDownload, assetPath, meta]);
  const handleCopyKey = useCallback(() => {
    if (meta.value) {
      navigator.clipboard.writeText(meta.value);
    }
  }, [meta.value]);
  return (
    <Dialog
      open={show}
      closeDialog={onClose}
      title={meta.name}
      size="workspace"
      footer={
        <>
          <Button color="default" onClick={onClose}>
            {intl.formatMessage(messages.closePreview)}
          </Button>
          {meta.type !== 'apikey' ? (
            <Button
              onClick={handleDownload}
              icon={<DownloadIcon />}
              color="primary"
            >
              {intl.formatMessage(messages.downloadAsset)}
            </Button>
          ) : (
            <Button onClick={handleCopyKey} icon={<ContentCopyIcon />}>
              {intl.formatMessage(messages.copyAPIKey)}
            </Button>
          )}
        </>
      }
    >
      <AssetRenderer id={id} />
    </Dialog>
  );
};
export default compose(
  withAssetMeta,
  withAssetPath,
)(Preview) as React.ComponentType<PreviewOwnProps>;
