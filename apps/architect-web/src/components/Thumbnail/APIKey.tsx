import cx from 'classnames';
import { KeyRound } from 'lucide-react';

import withAssetMeta from '~/components/Assets/withAssetMeta';

import {
  thumbnailBase,
  thumbnailExisting,
  thumbnailIcon,
  thumbnailLabel,
} from './styles';

type APIKeyThumbnailProps = {
  id: string;
  meta?: {
    name: string;
  };
};

const APIKeyThumbnail = ({ id, meta = { name: '' } }: APIKeyThumbnailProps) => (
  <div className={cx(thumbnailBase, id === 'existing' && thumbnailExisting)}>
    <div className={thumbnailIcon}>
      <KeyRound className="icon" />
    </div>
    <div className={thumbnailLabel}>{meta.name}</div>
  </div>
);

export default withAssetMeta(APIKeyThumbnail);
