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
    <motion.div variants={variants} className="flex items-center gap-4">
      <span className="inline-flex">
        <img src={ncMarkUrl} alt="" className="size-20" />
      </span>
      <Heading level="h1" margin="none" className="font-black tracking-tight">
        Interviewer
      </Heading>
    </motion.div>
  );
}
