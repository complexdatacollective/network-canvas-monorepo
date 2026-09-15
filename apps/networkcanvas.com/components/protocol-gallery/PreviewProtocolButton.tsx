'use client';

import { Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { MouseEvent } from 'react';

import Button from '@codaco/fresco-ui/Button';

// The features string asks for a separate popup window sized for an interview.
// A browser that refuses the popup leaves the click to the anchor, which opens
// the same page as a tab.
const POPUP_FEATURES = 'popup,width=1280,height=800';

function openPreviewPopup(event: MouseEvent<HTMLAnchorElement>) {
  if (event.defaultPrevented) return;
  const popup = window.open(event.currentTarget.href, '_blank', POPUP_FEATURES);
  if (!popup) return;
  // The preview loads everything it needs from its own URL and never talks
  // back to this page.
  popup.opener = null;
  event.preventDefault();
}

export function PreviewProtocolButton({ href }: { href: string }) {
  const t = useTranslations('ProtocolGallery.detail');

  return (
    <Button
      asChild
      color="success"
      variant="raised"
      icon={<Play aria-hidden />}
    >
      <a href={href} target="_blank" rel="noopener" onClick={openPreviewPopup}>
        {t('preview')}
      </a>
    </Button>
  );
}
