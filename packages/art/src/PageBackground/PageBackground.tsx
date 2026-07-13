'use client';

import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState, type CSSProperties } from 'react';

import BackgroundBlobs from '../BackgroundBlobs/BackgroundBlobs';

type BlobPalette = ReadonlyArray<readonly [string, string]>;

const colorTokens = {
  ceruleanBlue: ['--cerulean-blue', '.5824 .229 260.09'],
  mustard: ['--mustard', '.81 .17 86.39'],
  neonCoral: ['--neon-coral', '.5733 .2584 11.57'],
  seaGreen: ['--sea-green', '.7 .2 171.52'],
} as const;

const backgroundStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 0,
  overflow: 'hidden',
  opacity: 0.1,
  pointerEvents: 'none',
};

const canvasStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
};

function resolveThemeColor(
  styles: CSSStyleDeclaration,
  [variable, fallback]: readonly [string, string],
) {
  const components = styles.getPropertyValue(variable).trim() || fallback;
  return `oklch(${components})`;
}

function resolveBlobPalette(): BlobPalette {
  const styles = getComputedStyle(document.documentElement);
  const ceruleanBlue = resolveThemeColor(styles, colorTokens.ceruleanBlue);
  const mustard = resolveThemeColor(styles, colorTokens.mustard);
  const neonCoral = resolveThemeColor(styles, colorTokens.neonCoral);
  const seaGreen = resolveThemeColor(styles, colorTokens.seaGreen);

  return [
    [neonCoral, mustard],
    [seaGreen, ceruleanBlue],
    [ceruleanBlue, neonCoral],
  ];
}

export function PageBackground() {
  const reduceMotion = useReducedMotion();
  const [palette, setPalette] = useState<BlobPalette | null>(null);

  useEffect(() => setPalette(resolveBlobPalette()), []);

  return (
    <div aria-hidden="true" style={backgroundStyle}>
      {palette && reduceMotion === false && (
        <motion.div
          style={canvasStyle}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <BackgroundBlobs
            large={2}
            medium={3}
            small={1}
            speedFactor={0.35}
            palette={palette}
          />
        </motion.div>
      )}
    </div>
  );
}
