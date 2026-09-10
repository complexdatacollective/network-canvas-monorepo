import { motion } from 'motion/react';

import Spinner from '@codaco/fresco-ui/Spinner';
import Heading from '@codaco/fresco-ui/typography/Heading';
import { cx } from '@codaco/fresco-ui/utils/cva';

type LoadingProps = {
  message?: string;
  className?: string;
  small?: boolean;
};

const Loading = ({ message, className = '', small = false }: LoadingProps) => (
  <motion.div
    // No `loading` class: the classic app's `.loading` (flex-centering,
    // size, padding) was never ported to the shared Tailwind theme, and both
    // current callers already centre this component in their own
    // `flex items-center justify-center` wrapper (NodePanel, NameGeneratorRoster).
    className={cx(className)}
    key="loading"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
  >
    <Heading level="h4">{message}</Heading>
    <Spinner size={small ? 'sm' : 'md'} />
  </motion.div>
);

export default Loading;
