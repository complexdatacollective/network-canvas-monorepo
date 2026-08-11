import { motion } from 'motion/react';

import Heading from '@codaco/fresco-ui/typography/Heading';
import ncMarkUrl from '~/assets/NC-Flat.png';

const variants = {
  hidden: { opacity: 0, y: -8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, delay: 0.05 } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.55 } },
};

export function BrandHeader() {
  return (
    <motion.div
      variants={variants}
      className="tablet-landscape:gap-3 laptop:gap-4 flex items-center gap-4"
    >
      <span className="inline-flex shrink-0">
        <img
          src={ncMarkUrl}
          alt=""
          className="tablet-landscape:h-14 laptop:h-20 h-16 w-auto"
        />
      </span>
      <Heading
        level="h1"
        margin="none"
        className="tablet-landscape:not-sr-only tablet-landscape:text-2xl laptop:text-3xl sr-only font-black tracking-tight"
      >
        Interviewer
      </Heading>
    </motion.div>
  );
}
