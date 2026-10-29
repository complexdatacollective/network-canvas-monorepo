'use client';

import { Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import { usePrefersReducedMotion } from '@codaco/fresco-ui/reducedMotion';

// A standalone page, so its scenes and styles stay apart from the docs'. Its
// screenshots are the guide's own, under /assets/img/fresco-images.
const WALKTHROUGH = '/assets/walkthroughs/fresco-deployment';

const CHAPTERS = [
  'fork',
  'database',
  'netlify',
  'setup',
  'storage',
  'finish',
] as const;

type Chapter = (typeof CHAPTERS)[number];

const isChapter = (value: unknown): value is Chapter =>
  CHAPTERS.some((chapter) => chapter === value);

// The walkthrough posts Escape back to the page, since keys pressed in the
// frame never reach it, and its "Read this step in the guide" link posts the
// section's heading id.
type WalkthroughMessage =
  | { type: 'fresco-walkthrough:close' }
  | { type: 'fresco-walkthrough:section'; anchor: string };

const isWalkthroughMessage = (data: unknown): data is WalkthroughMessage =>
  typeof data === 'object' &&
  data !== null &&
  'type' in data &&
  (data.type === 'fresco-walkthrough:close' ||
    (data.type === 'fresco-walkthrough:section' &&
      'anchor' in data &&
      typeof data.anchor === 'string'));

// With a `chapter`, a compact button that opens the walkthrough at that step;
// without one, a poster card for the whole walkthrough.
export default function DeploymentWalkthrough({
  chapter: requested,
}: {
  chapter?: string;
}) {
  const chapter = isChapter(requested) ? requested : undefined;
  const t = useTranslations('DeploymentWalkthrough');
  const [open, setOpen] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const section = useRef<string | null>(null);
  const descriptionId = useId();
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (!open) return undefined;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== frame.current?.contentWindow) return;
      if (!isWalkthroughMessage(event.data)) return;
      if (event.data.type === 'fresco-walkthrough:section') {
        section.current = event.data.anchor;
      }
      setOpen(false);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [open]);

  // Closing to read a section moves focus to its heading and scrolls it to
  // the top; otherwise focus returns to the control that opened the dialog.
  // Focus alone does not scroll: the dialog returns focus without moving the
  // page, so the heading would stay wherever it was, even off screen.
  const sectionHeading = () => {
    const anchor = section.current;
    section.current = null;
    const heading = anchor ? document.getElementById(anchor) : null;
    if (!heading) return null;
    heading.tabIndex = -1;
    window.history.replaceState(null, '', `#${anchor}`);
    window.requestAnimationFrame(() => {
      heading.scrollIntoView({
        block: 'start',
        behavior: reduced ? 'auto' : 'smooth',
      });
    });
    return heading;
  };

  const src = `${WALKTHROUGH}/index.html?embed&autoplay${chapter ? `#chapter=${chapter}` : ''}`;

  return (
    <>
      {chapter ? (
        <Button
          variant="outline"
          size="sm"
          color="primary"
          icon={<Play aria-hidden className="size-4" />}
          onClick={() => setOpen(true)}
          className="my-4"
        >
          {t('watchStep')}
        </Button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t('watch')}
          aria-describedby={descriptionId}
          className="focusable group bg-surface text-surface-contrast elevation-low hover:elevation-medium my-8 grid w-full cursor-pointer overflow-hidden rounded text-left transition-shadow"
        >
          <span className="relative block">
            <img
              src={`${WALKTHROUGH}/poster.jpg`}
              alt=""
              width={1240}
              height={698}
              className="block aspect-video w-full object-cover"
            />
            <span className="absolute inset-0 grid place-items-center">
              <span className="bg-primary text-primary-contrast elevation-high grid size-16 place-items-center rounded-full transition-transform group-hover:scale-110 motion-reduce:transition-none">
                <Play aria-hidden className="size-7 translate-x-0.5" />
              </span>
            </span>
          </span>
          <span className="grid gap-1 p-6">
            <span className="font-heading text-lg font-bold">{t('watch')}</span>
            <span id={descriptionId} className="text-sm opacity-75">
              {t('description')}
            </span>
          </span>
        </button>
      )}
      <Dialog
        open={open}
        closeDialog={() => setOpen(false)}
        title={t('title')}
        size="fullscreen"
        finalFocus={sectionHeading}
      >
        <iframe
          ref={frame}
          title={t('frameTitle')}
          src={src}
          className="block h-[calc(100dvh-13rem)] max-h-[54rem] w-full rounded"
        />
      </Dialog>
    </>
  );
}
