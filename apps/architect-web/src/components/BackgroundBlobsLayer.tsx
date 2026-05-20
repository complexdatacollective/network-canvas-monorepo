import { motion } from 'motion/react';

import { BackgroundBlobs } from '@codaco/art';

type Intensity = 'bold' | 'medium' | 'dim';

const PRESETS: Record<
  Intensity,
  {
    opacity: number;
    duration: number;
    compositeOperation: GlobalCompositeOperation;
    filter?: string;
  }
> = {
  bold: { opacity: 0.7, duration: 2, compositeOperation: 'color-dodge' },
  medium: {
    opacity: 0.2,
    duration: 1,
    compositeOperation: 'source-over',
    filter: 'saturate(0.7)',
  },
  dim: {
    opacity: 0.1,
    duration: 1,
    compositeOperation: 'source-over',
    filter: 'saturate(0.4)',
  },
};

const BackgroundBlobsLayer = ({ intensity }: { intensity: Intensity }) => {
  const { opacity, duration, compositeOperation, filter } = PRESETS[intensity];

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
        compositeOperation={compositeOperation}
        filter={filter}
      />
    </motion.div>
  );
};

export default BackgroundBlobsLayer;
