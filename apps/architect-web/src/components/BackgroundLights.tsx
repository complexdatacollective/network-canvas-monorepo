import { motion } from 'motion/react';

type Intensity = 'bold' | 'medium' | 'dim';

// Overall opacity of the whole layer per app location. The start screen
// ('bold') gets the most presence; stage editing ('dim') stays out of the way.
const LAYER_OPACITY: Record<Intensity, number> = {
  bold: 0.45,
  medium: 0.22,
  dim: 0.1,
};

const LIGHTS = [
  {
    position: '-top-[20vmax] -left-[15vmax] h-[55vmax] w-[55vmax]',
    color: 'hsl(var(--sea-green) / 0.45)',
  },
  {
    position: '-bottom-[25vmax] -right-[10vmax] h-[60vmax] w-[60vmax]',
    color: 'color-mix(in oklch, var(--color-fresco-purple), transparent 78%)',
  },
  {
    position: '-top-[10vmax] right-[5vmax] h-[40vmax] w-[40vmax]',
    color: 'hsl(var(--slate-blue) / 0.4)',
  },
  {
    position: 'bottom-[5vmax] -left-[10vmax] h-[35vmax] w-[35vmax]',
    color: 'hsl(var(--sea-green) / 0.3)',
  },
];

const BackgroundLights = ({ intensity }: { intensity: Intensity }) => (
  <motion.div
    aria-hidden
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
