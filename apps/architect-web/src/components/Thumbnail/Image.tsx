import cx from 'classnames';
import type React from 'react';

import withAssetUrl from '~/components/Assets/withAssetUrl';

import { thumbnailBase } from './styles';

type ImageThumbnailProps = {
  url?: string;
  contain?: boolean;
} & React.HTMLAttributes<HTMLDivElement>;

const ImageThumbnail = ({
  url,
  contain: _contain = false,
  ...props
}: ImageThumbnailProps) => {
  const className = cx(
    thumbnailBase,
    'h-(--space-6xl) bg-contain bg-center bg-no-repeat',
  );
  return (
    <div
      className={className}
      style={{ backgroundImage: url ? `url(${url})` : undefined }}
      {...props}
    />
  );
};

export default withAssetUrl(ImageThumbnail);
