import { motion } from 'motion/react';
import type { ReactNode } from 'react';

type PanelProps = {
  isComplete?: boolean;
  isActive?: boolean;
  children?: ReactNode;
};

const getAnimation = ({
  isComplete,
  isActive,
}: {
  isComplete: boolean;
  isActive: boolean;
}) => {
  if (isComplete) {
    return { x: '-100%' };
  }
  if (isActive) {
    return { x: 0 };
  }
  return { x: '100%' };
};

const Panel = ({
  isComplete = false,
  isActive = false,
  children = null,
}: PanelProps) => {
  const animate = getAnimation({ isActive, isComplete });

  return (
    <motion.div
      initial={{ x: 0 }}
      animate={animate}
      transition={{ duration: 0.2, type: 'tween' }}
      className="absolute top-0 left-0 flex h-(--datepicker-panel-height) w-full grow-0 basis-full flex-row"
    >
      {children}
    </motion.div>
  );
};

export default Panel;
