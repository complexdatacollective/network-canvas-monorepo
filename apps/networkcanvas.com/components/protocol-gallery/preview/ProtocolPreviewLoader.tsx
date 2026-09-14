'use client';

import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { Suspense } from 'react';

import { PreviewLoadingScreen } from './PreviewScreen';
import type { ProtocolPreviewProps } from './ProtocolPreview';

function Loading() {
  const t = useTranslations('ProtocolGallery.preview');
  return <PreviewLoadingScreen label={t('loading')} />;
}

// The interview engine is browser-only and far larger than the rest of the
// site, so it is neither prerendered nor part of any other page's bundle.
const ProtocolPreview = dynamic(
  () => import('./ProtocolPreview').then((module) => module.ProtocolPreview),
  { ssr: false, loading: Loading },
);

export function ProtocolPreviewLoader(props: ProtocolPreviewProps) {
  return (
    <Suspense fallback={<Loading />}>
      <ProtocolPreview {...props} />
    </Suspense>
  );
}
