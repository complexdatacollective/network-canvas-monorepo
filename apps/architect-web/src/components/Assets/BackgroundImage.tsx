import type React from 'react';

import { cx } from '~/utils/cva';

import withAssetUrl from './withAssetUrl';

type BackgroundImageProps = {
  url?: string;
} & React.HTMLAttributes<HTMLDivElement>;

const BackgroundImage = ({
  url,
  className,
  ...props
}: BackgroundImageProps) => {
  if (!url) {
    return <div className={className} {...props} />;
  }

  return (
    <div
      className={cx('flex items-center justify-center', className)}
      {...props}
    >
      <img src={url} alt="" className="max-h-full max-w-full object-contain" />
    </div>
  );
};

export default withAssetUrl(BackgroundImage);
