import { motion } from 'motion/react';

import Heading from '@codaco/fresco-ui/typography/Heading';
import ncMarkUrl from '~/assets/NC-Flat.png';

const EASE = [0.22, 1, 0.36, 1] as const;

export function BrandHeader() {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: 0.05, ease: EASE }}
      className="flex items-center gap-[18px]"
    >
      <motion.span
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.12, ease: EASE }}
        className="inline-flex"
      >
        <img src={ncMarkUrl} alt="" className="size-20" />
      </motion.span>
      <Heading level="h1" margin="none" className="font-black tracking-tight">
        Interviewer
      </Heading>
    </motion.div>
  );
}
