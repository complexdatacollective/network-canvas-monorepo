import { motion } from 'motion/react';

type Intensity = 'bold' | 'medium' | 'dim';

// Overall opacity of the whole layer per app location. The start screen
// ('bold') gets the most presence; stage editing ('dim') stays out of the way.
const LAYER_OPACITY: Record<Intensity, number> = {
  bold: 0.9,
  medium: 0.45,
  dim: 0.2,
};

// A static set of softly blurred "lights" tinted with the app's brand colors:
// the sea green brand colour, the deep nav-bar purple, and the lighter slate
// blue. They sit far enough off-screen that only their blurred edges bleed in,
// giving a subtle tinted glow over the platinum page background. Each light is
// a plain blurred div, so unlike the previous canvas-based BackgroundBlobs this
// renders once and costs nothing to keep on screen.
const LIGHTS = [
  // Sea green brand glow, top-left.
  'bg-sea-green/40 -top-[20vmax] -left-[15vmax] h-[55vmax] w-[55vmax]',
  // Deep nav-bar purple, lower-right, gently anchoring the composition. Kept at
  // a low opacity since this colour is very dark and would otherwise read as a
  // hard shadow rather than a soft light.
  'bg-fresco-purple/20 -bottom-[25vmax] -right-[10vmax] h-[60vmax] w-[60vmax]',
  // Lighter slate blue accent, upper-right.
  'bg-slate-blue/30 -top-[10vmax] right-[5vmax] h-[40vmax] w-[40vmax]',
  // A faint second sea green pool, lower-left, for balance.
  'bg-sea-green/25 bottom-[5vmax] -left-[10vmax] h-[35vmax] w-[35vmax]',
];

const BackgroundLights = ({ intensity }: { intensity: Intensity }) => (
  <motion.div
    aria-hidden
    className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    initial={{ opacity: 0 }}
    animate={{ opacity: LAYER_OPACITY[intensity] }}
    transition={{ duration: 1 }}
  >
    {LIGHTS.map((light) => (
      <div
        key={light}
        className={`absolute rounded-full blur-[8rem] ${light}`}
      />
    ))}
  </motion.div>
);

export default BackgroundLights;
