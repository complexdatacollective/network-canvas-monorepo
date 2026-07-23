'use client';

import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from 'motion/react';
import Image from 'next/image';
import { useRef, useSyncExternalStore } from 'react';

const subscribeToHydration = () => () => undefined;
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

export function ScreenshotFrame({
  address,
  alt,
  src,
}: {
  address: string;
  alt: string;
  src: string;
}) {
  const shouldReduceMotion = useReducedMotion();
  const frameRef = useRef<HTMLDivElement>(null);
  const hasHydrated = useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );
  const motionEnabled = hasHydrated && shouldReduceMotion === false;
  const { scrollYProgress } = useScroll({
    target: frameRef,
    offset: ['start 92%', 'end 8%'],
  });
  const sheenX = useTransform(
    scrollYProgress,
    [0, 0.24, 0.76, 1],
    ['-140%', '520%', '520%', '-140%'],
  );
  const sheenOpacity = useTransform(
    scrollYProgress,
    [0, 0.08, 0.22, 0.78, 0.92, 1],
    [0, 1, 0, 0, 1, 0],
  );
  const screenshotClipPath = useTransform(
    scrollYProgress,
    [0, 0.2, 0.76, 1],
    [
      'inset(0 0 100% 0)',
      'inset(0 0 0% 0)',
      'inset(0 0 0% 0)',
      'inset(100% 0 0 0)',
    ],
  );
  const screenshotOpacity = useTransform(
    scrollYProgress,
    [0, 0.15, 0.82, 1],
    [0.5, 1, 1, 0.5],
  );
  const screenshotY = useTransform(
    scrollYProgress,
    [0, 0.2, 0.78, 1],
    [14, 0, 0, -14],
  );

  return (
    <div
      ref={frameRef}
      className="elevation-medium bg-surface overflow-hidden rounded"
    >
      <div
        className="relative flex items-center gap-2 overflow-hidden border-b border-current/10 px-4 py-3"
        aria-hidden
      >
        <motion.span
          className="via-sea-serpent/25 absolute inset-y-0 left-0 w-1/4 bg-linear-to-r from-transparent to-transparent"
          style={
            motionEnabled ? { opacity: sheenOpacity, x: sheenX } : undefined
          }
        />
        <span className="bg-neon-coral relative size-2.5 rounded-full" />
        <span className="bg-mustard relative size-2.5 rounded-full" />
        <span className="bg-sea-green relative size-2.5 rounded-full" />
        <span className="font-monospace relative ml-2 truncate text-xs text-current/55">
          {address}
        </span>
      </div>
      <motion.div
        className="relative aspect-4/3 origin-top overflow-hidden bg-white"
        style={
          motionEnabled
            ? {
                clipPath: screenshotClipPath,
                opacity: screenshotOpacity,
                y: screenshotY,
              }
            : undefined
        }
      >
        <Image
          fill
          src={src}
          alt={alt}
          sizes="(min-width: 801px) 50vw, 100vw"
          className="fit"
        />
      </motion.div>
    </div>
  );
}
