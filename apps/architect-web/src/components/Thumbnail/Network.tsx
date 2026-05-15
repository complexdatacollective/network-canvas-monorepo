import cx from 'classnames';
import type React from 'react';

import withAssetMeta from '~/components/Assets/withAssetMeta';
import Icon from '~/lib/legacy-ui/components/Icon';

import {
  thumbnailBase,
  thumbnailExisting,
  thumbnailIcon,
  thumbnailLabel,
} from './styles';

type NetworkThumbnailProps = {
  id: string;
  meta?: {
    name: string;
  };
};

const NetworkThumbnail = ({
  id,
  meta = { name: '' },
}: NetworkThumbnailProps) => (
  <div className={cx(thumbnailBase, id === 'existing' && thumbnailExisting)}>
    <div className={thumbnailIcon}>
      <Icon name="menu-sociogram" />
    </div>
    <div className={thumbnailLabel}>{meta.name}</div>
  </div>
);

export default withAssetMeta(NetworkThumbnail) as React.ComponentType<{
  id: string;
}>;
