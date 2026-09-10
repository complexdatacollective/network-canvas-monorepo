import { KeyRound } from 'lucide-react';

import withAssetMeta from '~/components/Assets/withAssetMeta';
import { cx } from '~/utils/cva';

import {
  thumbnailBase,
  thumbnailExisting,
  thumbnailIcon,
  thumbnailInteractive,
  thumbnailLabel,
} from './styles';

type APIKeyThumbnailProps = {
  id: string;
  meta?: {
    name: string;
  };
  interactive?: boolean;
};

const APIKeyThumbnail = ({
  id,
  meta = { name: '' },
  interactive,
}: APIKeyThumbnailProps) => (
  <div
    className={cx(
      thumbnailBase,
      id === 'existing' && thumbnailExisting,
      interactive && thumbnailInteractive,
    )}
  >
    <div className={thumbnailIcon}>
      {/* No `icon` class: unlike VariablePill's icon (targeted by a sibling
          `[&_.icon]:w-5`), nothing here selects on it — `thumbnailIcon`'s own
          `[&_svg]:size-full` already sizes this element, matching the plain
          `<Icon />` usage in the sibling GeoJSON/Network thumbnails. */}
      <KeyRound />
    </div>
    <div className={thumbnailLabel}>{meta.name}</div>
  </div>
);

export default withAssetMeta(APIKeyThumbnail);
