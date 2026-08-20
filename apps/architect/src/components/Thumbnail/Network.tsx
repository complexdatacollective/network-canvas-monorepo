import type React from 'react';

import Icon from '@codaco/fresco-ui/Icon';
import withAssetMeta from '~/components/Assets/withAssetMeta';
import { cx } from '~/utils/cva';

import {
  thumbnailBase,
  thumbnailExisting,
  thumbnailIcon,
  thumbnailInteractive,
  thumbnailLabel,
} from './styles';

type NetworkThumbnailProps = {
  id: string;
  meta?: {
    name: string;
  };
  interactive?: boolean;
};

const NetworkThumbnail = ({
  id,
  meta = { name: '' },
  interactive,
}: NetworkThumbnailProps) => (
  <div
    className={cx(
      thumbnailBase,
      id === 'existing' && thumbnailExisting,
      interactive && thumbnailInteractive,
    )}
  >
    <div className={thumbnailIcon}>
      <Icon name="menu-sociogram" />
    </div>
    <div className={thumbnailLabel}>{meta.name}</div>
  </div>
);

export default withAssetMeta(NetworkThumbnail) as React.ComponentType<{
  id: string;
  interactive?: boolean;
}>;
