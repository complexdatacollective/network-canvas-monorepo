'use client';

import { useReducedMotion } from 'motion/react';
import Image from 'next/image';

const mediaClasses = 'absolute inset-0 size-full object-cover';

export function HeroVideo() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div
      aria-hidden="true"
      className="bg-cyber-grape relative aspect-4/3 w-full overflow-hidden rounded-[1.75rem] shadow-2xl"
    >
      {shouldReduceMotion === false ? (
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
