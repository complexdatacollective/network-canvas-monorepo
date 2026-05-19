import { motion } from 'motion/react';

import { BackgroundBlobs } from '@codaco/art';

type Intensity = 'bold' | 'dim';

const PRESETS: Record<Intensity, { opacity: number; duration: number }> = {
  bold: { opacity: 0.7, duration: 2 },
  dim: { opacity: 0.35, duration: 1 },
};

const BackgroundBlobsLayer = ({ intensity }: { intensity: Intensity }) => {
  const { opacity, duration } = PRESETS[intensity];

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 blur-[10rem]"
      initial={{ opacity: 0 }}
      animate={{ opacity }}
      transition={{ duration }}
    >
      <BackgroundBlobs
        large={0}
        medium={4}
        small={0}
        compositeOperation="color-dodge"
      />
    </motion.div>
  );
};

export default BackgroundBlobsLayer;
