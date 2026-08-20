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

type GeoJSONThumbnailProps = {
  id: string;
  meta?: {
    name: string;
  };
  interactive?: boolean;
};

const GeoJSONThumbnail = ({
  id,
  meta = { name: '' },
  interactive,
}: GeoJSONThumbnailProps) => (
  <div
    className={cx(
      thumbnailBase,
      id === 'existing' && thumbnailExisting,
      interactive && thumbnailInteractive,
    )}
  >
    <div className={thumbnailIcon}>
      <Icon name="menu-map" />
    </div>
    <div className={thumbnailLabel}>{meta.name}</div>
  </div>
);

export default withAssetMeta(GeoJSONThumbnail);
