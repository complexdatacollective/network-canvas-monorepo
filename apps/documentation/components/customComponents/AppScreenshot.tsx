'use client';

import { APP_LABELS } from '~/components/customComponents/appVariants';
import { useSelectedApp } from '~/components/customComponents/useSelectedApp';

type AppScreenshotProps = {
  name: string;
  web?: string | boolean;
  alt?: string;
};

export const AppScreenshot = ({ name, web, alt = '' }: AppScreenshotProps) => {
  const [selectedApp] = useSelectedApp();

  const isWeb = web !== undefined && web !== false && web !== 'false';
  const desktopSrc = `/assets/img/architect-guide/${name}.png`;
  const webSrc = `/assets/img/architect-web-guide/${name}.png`;
  const src = selectedApp !== APP_LABELS.desktop && isWeb ? webSrc : desktopSrc;

  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      className="my-10 w-full px-8"
    >
      <img src={src} alt={alt} className="w-full" />
    </a>
  );
};
