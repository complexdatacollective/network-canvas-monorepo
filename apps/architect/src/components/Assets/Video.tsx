/* eslint-disable jsx-a11y/media-has-caption */

import type React from 'react';

import { cx } from '~/utils/cva';

import withAssetUrl from './withAssetUrl';

type VideoProps = {
  description?: string;
  url: string;
} & React.VideoHTMLAttributes<HTMLVideoElement>;

const Video = ({ url, description = '', className, ...props }: VideoProps) => (
  <video
    src={url}
    className={cx('max-h-full max-w-full object-contain', className)}
    // eslint-disable-next-line react/jsx-props-no-spreading
    {...props}
    playsInline
  >
    {description}
  </video>
);

export default withAssetUrl(Video);
