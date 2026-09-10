'use client';

import { useReducedMotion } from 'motion/react';
import Image from 'next/image';
import { useEffect, useState } from 'react';

const mediaClasses = 'absolute inset-0 size-full object-cover';

export function HeroVideo() {
  const shouldReduceMotion = useReducedMotion();
  const [hasMounted, setHasMounted] = useState(false);

  // Must stay an effect, not a lazy useState initializer: the server (and the
  // first client render, which has to match it for hydration) always renders
  // the poster <Image>. Only after hydration completes can we safely switch
  // to <video> — an effect is the one thing that never runs during SSR or
  // the hydrating render.
  useEffect(() => {
    setHasMounted(true);
  }, []);

  return (
    <div
      data-homepage-weave-target
      aria-hidden="true"
      className="bg-cyber-grape relative aspect-4/3 w-full overflow-hidden rounded shadow-2xl"
    >
      {hasMounted && shouldReduceMotion === false ? (
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
