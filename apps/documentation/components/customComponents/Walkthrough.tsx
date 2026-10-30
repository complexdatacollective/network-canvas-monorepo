'use client';

import { Footprints, Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useRef, useState } from 'react';

import { Button } from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { usePrefersReducedMotion } from '@codaco/fresco-ui/reducedMotion';
import { firstBeatOf, visibleBeats } from '~/components/walkthrough/sequence';
import useWalkthroughProgress from '~/components/walkthrough/useWalkthroughProgress';
import WalkthroughPlayer from '~/components/walkthrough/WalkthroughPlayer';
import { getWalkthrough } from '~/walkthroughs/registry';

// With a `chapter`, a compact button that opens the walkthrough at that
// chapter; without one, a card for the whole walkthrough that resumes where
// the reader left off.
export default function Walkthrough({
  id,
  chapter,
}: {
  id: string;
  chapter?: string;
}) {
  const t = useTranslations('Walkthrough');
  const walkthrough = getWalkthrough(id);
  const [progress, saveProgress, started] = useWalkthroughProgress(id);
  const [open, setOpen] = useState(false);
  const section = useRef<string | null>(null);
  const descriptionId = useId();
  const reduced = usePrefersReducedMotion();

  if (!walkthrough) return null;

  const openAt = (chapterId?: string) => {
    if (chapterId) {
      saveProgress({
        ...progress,
        beat: firstBeatOf(
          visibleBeats(walkthrough, progress.choices),
          chapterId,
        ),
      });
    }
    setOpen(true);
  };

  const goToGuide = (anchor: string) => {
    section.current = anchor;
    setOpen(false);
  };

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

  const knownChapter = walkthrough.chapters.some((c) => c.id === chapter);

  return (
    <>
      {chapter && knownChapter ? (
        <Button
          variant="outline"
          size="sm"
          color="primary"
          icon={<Footprints aria-hidden className="size-4" />}
          onClick={() => openAt(chapter)}
          className="my-4"
        >
          {t('walkStep')}
        </Button>
      ) : (
        <Surface
          as="button"
          type="button"
          noContainer
          shadow="none"
          onClick={() => openAt()}
          aria-describedby={descriptionId}
          className="focusable group elevation-low hover:elevation-medium my-8 flex w-full cursor-pointer items-center gap-6 text-start transition-shadow"
        >
          <span className="bg-primary text-primary-contrast elevation-medium grid size-16 shrink-0 place-items-center rounded-full transition-transform group-hover:scale-110 motion-reduce:transition-none">
            <Play aria-hidden className="size-7 translate-x-0.5" />
          </span>
          <span className="grid gap-1">
            <span className="font-heading text-lg font-bold">
              {started ? t('resume') : t('start')}
            </span>
            <span id={descriptionId} className="text-sm opacity-75">
              {walkthrough.description}
            </span>
          </span>
        </Surface>
      )}
      <Dialog
        open={open}
        closeDialog={() => setOpen(false)}
        title={walkthrough.title}
        size="fullscreen"
        finalFocus={sectionHeading}
      >
        <WalkthroughPlayer
          walkthrough={walkthrough}
          progress={progress}
          onProgress={saveProgress}
          onGuide={goToGuide}
          onClose={() => setOpen(false)}
        />
      </Dialog>
    </>
  );
}
