import { motion } from 'motion/react';

type Intensity = 'bold' | 'medium' | 'dim';

// Overall opacity of the whole layer per app location. The start screen
// ('bold') gets the most presence; stage editing ('dim') stays out of the way.
const LAYER_OPACITY: Record<Intensity, number> = {
  bold: 0.45,
  medium: 0.22,
  dim: 0.1,
};

// Tints expressed uniformly as color-mix(in oklab, …) — matching the oklab
// color-mix used elsewhere in Architect (e.g. the shadow scale). Mixing a
// colour with `transparent N%` is equivalent to alpha (100 − N)%.
const LIGHTS = [
  {
    position: '-top-[20vmax] -left-[15vmax] h-[55vmax] w-[55vmax]',
    color: 'color-mix(in oklab, oklch(var(--sea-green)), transparent 55%)',
  },
  {
    position: '-bottom-[25vmax] -right-[10vmax] h-[60vmax] w-[60vmax]',
    color: 'color-mix(in oklab, oklch(10% 0.4 290), transparent 78%)',
  },
  {
    position: '-top-[10vmax] right-[5vmax] h-[40vmax] w-[40vmax]',
    color: 'color-mix(in oklab, oklch(var(--slate-blue)), transparent 60%)',
  },
  {
    position: 'bottom-[5vmax] -left-[10vmax] h-[35vmax] w-[35vmax]',
    color: 'color-mix(in oklab, oklch(var(--sea-green)), transparent 70%)',
  },
];

const BackgroundLights = ({ intensity }: { intensity: Intensity }) => (
  <motion.div
    aria-hidden
    // e2e visual-snapshot hook (apps/architect/e2e/helpers/visual.ts): the
    // layer's opacity fade-in is a framer-motion tween, immune to
    // Playwright's animations:'disabled'/reducedMotion:'reduce', so a
    // screenshot taken mid-fade would be non-deterministic. Baselines hide it
    // by this testid rather than trying to wait the tween out.
    data-testid="background-lights"
    className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    initial={{ opacity: 0 }}
    animate={{ opacity: LAYER_OPACITY[intensity] }}
    transition={{ duration: 1 }}
  >
    {LIGHTS.map(({ position, color }, index) => (
      <div
        key={index}
        className={`absolute ${position}`}
        style={{
          background: `radial-gradient(circle, ${color}, transparent 75%)`,
        }}
      />
    ))}
  </motion.div>
);

export default BackgroundLights;
