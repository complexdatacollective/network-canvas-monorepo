'use client';

import { type CSSProperties, useEffect, useMemo, useRef } from 'react';

import { defaultGradients } from '../BackgroundBlobs/BackgroundBlobs';

// Default to the BackgroundBlobs palette. Each entry there is a two-stop linear
// gradient; here every colour seeds one radial light, so the pairs flatten into
// a flat list of single colours.
const defaultColors = defaultGradients.flatMap((pair) => pair);

type Layer = 1 | 2 | 3;

const random = (min: number, max: number) => min + Math.random() * (max - min);

// Per-layer drift speed (px/second) and radius (fraction of the smaller
// viewport edge), mirroring @codaco/art's canvas NCBlob so a DOM light drifts
// and wraps like a blob of the same layer.
const layerSpeed: Record<Layer, () => number> = {
  1: () => random(3, 6),
  2: () => random(0.5, 1.5),
  3: () => 0.5,
};
// Radii as a fraction of the smaller viewport edge. These run large so each
// light carries its own soft, wide falloff.
const layerSize: Record<Layer, () => number> = {
  1: () => random(0.4, 0.6),
  2: () => random(1, 1.5),
  3: () => random(2, 2.6),
};

type Light = {
  color: string;
  sizeFraction: number;
  velocityX: number;
  velocityY: number;
};

const makeLayer = (
  layer: Layer,
  count: number,
  speedFactor: number,
  colors: readonly string[],
): Light[] =>
  Array.from({ length: count }, () => {
    const angle = random(0, Math.PI * 2);
    const speed = layerSpeed[layer]() * speedFactor;
    return {
      color:
        colors[Math.floor(random(0, colors.length))] ?? colors[0] ?? '#fff',
      sizeFraction: layerSize[layer](),
      velocityX: Math.sin(angle) * speed,
      velocityY: Math.cos(angle) * speed,
    };
  });

type BackgroundLightsProps = {
  large?: number;
  medium?: number;
  small?: number;
  speedFactor?: number;
  colors?: readonly string[];
  // Blends the lights against one another on the container's isolated,
  // transparent backdrop. 'color-dodge' reproduces the additive glow of
  // BackgroundBlobs' canvas compositing; the effect shows where lights overlap.
  blendMode?: CSSProperties['mixBlendMode'];
};

const BackgroundLights = ({
  large = 2,
  medium = 4,
  small = 4,
  speedFactor = 1,
  colors = defaultColors,
  blendMode,
}: BackgroundLightsProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const elementsRef = useRef<(HTMLDivElement | null)[]>([]);

  // large → big/slow, small → small/fast, matching BackgroundBlobs' layers.
  const lights = useMemo(
    () => [
      ...makeLayer(3, large, speedFactor, colors),
      ...makeLayer(2, medium, speedFactor, colors),
      ...makeLayer(1, small, speedFactor, colors),
    ],
    [large, medium, small, speedFactor, colors],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    // Runtime position/size lives outside React state so the animation loop can
    // mutate transforms every frame without triggering a re-render.
    const runtime = lights.map((light) => ({ light, x: 0, y: 0, size: 0 }));
    let width = 0;
    let height = 0;
    let placed = false;

    const measure = () => {
      width = container.clientWidth;
      height = container.clientHeight;
      const vmin = Math.min(width, height);
      runtime.forEach((entry, index) => {
        entry.size = entry.light.sizeFraction * vmin;
        const element = elementsRef.current[index];
        if (element) {
          element.style.width = `${entry.size}px`;
          element.style.height = `${entry.size}px`;
        }
      });
    };

    const applyTransforms = () => {
      runtime.forEach((entry, index) => {
        const element = elementsRef.current[index];
        if (element) {
          element.style.transform = `translate3d(${entry.x}px, ${entry.y}px, 0)`;
        }
      });
    };

    // Seed each light at a random position across the viewport once real
    // dimensions are known (layout may not have happened when the effect runs).
    const ensurePlaced = () => {
      if (placed || width <= 0 || height <= 0) return;
      runtime.forEach((entry) => {
        entry.x = random(-entry.size / 2, width - entry.size / 2);
        entry.y = random(-entry.size / 2, height - entry.size / 2);
      });
      placed = true;
      applyTransforms();
    };

    measure();
    ensurePlaced();

    const resizeObserver = new ResizeObserver(() => {
      measure();
      ensurePlaced();
    });
    resizeObserver.observe(container);

    const prefersReducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      return () => resizeObserver.disconnect();
    }

    let raf = 0;
    let last: number | null = null;
    const tick = (time: number) => {
      ensurePlaced();
      if (placed) {
        const dt = last === null ? 0 : (time - last) / 1000;
        runtime.forEach((entry) => {
          entry.x += entry.light.velocityX * dt;
          entry.y += entry.light.velocityY * dt;
          // Wrap offscreen → reappear on the opposite edge (mirrors NCBlob;
          // branches stay mutually exclusive so a reset can't re-trigger).
          if (entry.x < -entry.size) entry.x = width + entry.size;
          else if (entry.x > width) entry.x = -entry.size;
          if (entry.y < -entry.size) entry.y = height + entry.size;
          else if (entry.y > height) entry.y = -entry.size;
        });
        applyTransforms();
      }
      last = time;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
    };
  }, [lights]);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="absolute inset-0 isolate overflow-hidden"
    >
      {lights.map((light, index) => (
        <div
          key={index}
          ref={(element) => {
            elementsRef.current[index] = element;
          }}
          className="absolute top-0 left-0 will-change-transform"
          style={{
            // `closest-side` fades the glow to transparent by the div's nearest
            // edge, so the square box never shows as a hard clip.
            background: `radial-gradient(circle closest-side, ${light.color}, transparent)`,
            mixBlendMode: blendMode,
          }}
        />
      ))}
    </div>
  );
};

export default BackgroundLights;
