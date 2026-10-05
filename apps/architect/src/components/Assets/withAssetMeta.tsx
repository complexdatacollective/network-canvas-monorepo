import { get } from 'es-toolkit/compat';
import type { ComponentType } from 'react';
import { useSelector } from 'react-redux';

import { useAppIntl } from '@codaco/app-i18n/react';
import { getDisplayAssetManifest } from '~/selectors/protocol';

import { assetMetadataMessages } from './assetMetadataMessages';

type OwnProps = { id: string };
type WithMetaProps = { meta: { name: string } };

/** Selected-resource thumbnails and preview titles use the same authored metadata. */
function withAssetMeta<P extends object>(
  Component: ComponentType<P & WithMetaProps>,
): ComponentType<P & OwnProps> {
  return function AssetMeta(props: P & OwnProps) {
    const intl = useAppIntl();
    const assetManifest = useSelector(getDisplayAssetManifest);
    const meta = get(assetManifest, props.id, {
      name: intl.formatMessage(assetMetadataMessages.interviewNetwork),
    });
    return <Component {...props} meta={meta} />;
  };
}

export default withAssetMeta;
