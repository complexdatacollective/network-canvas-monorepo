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
      <KeyRound className="icon" />
    </div>
    <div className={thumbnailLabel}>{meta.name}</div>
  </div>
);

export default withAssetMeta(APIKeyThumbnail);
