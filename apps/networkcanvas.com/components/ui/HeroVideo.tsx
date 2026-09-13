'use client';

import { useReducedMotion } from 'motion/react';
import Image from 'next/image';

import useHasHydrated from '@codaco/fresco-ui/hooks/useHasHydrated';

const mediaClasses = 'absolute inset-0 size-full object-cover';

export function HeroVideo() {
  const shouldReduceMotion = useReducedMotion();
  // The server, and the hydrating client render that has to match it, render
  // the poster <Image>; only once past hydration can we swap in the <video>.
  // A client-only mount has no server markup to agree with, so the hook is
  // already true on its first render and the video is there on the first
  // frame instead of after a poster flash.
  const hasHydrated = useHasHydrated();

  return (
    <div
      data-homepage-weave-target
      aria-hidden="true"
      className="bg-cyber-grape relative aspect-4/3 w-full overflow-hidden rounded shadow-2xl"
    >
      {hasHydrated && shouldReduceMotion === false ? (
        <video
          aria-hidden="true"
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          poster="/images/hero-video-poster.jpg"
          className={mediaClasses}
        >
          <source src="/videos/hero-video.mp4" type="video/mp4" />
        </video>
      ) : (
        <Image
          fill
          priority
          src="/images/hero-video-poster.jpg"
          alt=""
          sizes="(min-width: 1024px) 55vw, 100vw"
          className={mediaClasses}
        />
      )}
    </div>
  );
}
