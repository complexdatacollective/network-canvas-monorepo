import { Lock, Settings } from 'lucide-react';
import { motion } from 'motion/react';

import { IconButton } from '@codaco/fresco-ui/Button';
import { ViewSwitcher } from '~/components/ViewSwitcher';
import { useAuth } from '~/lib/auth/AuthContext';

// Glass-pill treatment layered over the standard Button: backdrop-blur surface
// with the theme outline, sized to match BrandHeader's height (h-14).
export const GLASS_PILL =
  'border border-outline bg-surface/50 backdrop-blur-md shadow-md uppercase font-black';

type TopActionBarProps = {
  onOpenSettings: () => void;
};

const variants = {
  hidden: { opacity: 0, y: -6 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55 } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.55 } },
};

export function TopActionBar({ onOpenSettings }: TopActionBarProps) {
  const { mode, lock } = useAuth();
  const showLock = mode !== undefined && mode !== 'none';

  return (
    <div className="flex items-center gap-3">
      <ViewSwitcher />
      {showLock && (
        <motion.span
          variants={variants}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.94 }}
          className="inline-flex"
        >
          <IconButton
            variant="text"
            icon={<Lock size={22} className="stroke-[3px]" aria-hidden />}
            aria-label="Lock app"
            onClick={() => {
              void lock();
            }}
            className={GLASS_PILL}
          />
        </motion.span>
      )}
      <motion.span
        variants={variants}
        whileHover={{ y: -2, rotate: -8 }}
        whileTap={{ scale: 0.94 }}
        className="inline-flex"
      >
        <IconButton
          variant="text"
          icon={<Settings size={22} className="stroke-[3px]" aria-hidden />}
          aria-label="Settings"
          onClick={onOpenSettings}
          className={GLASS_PILL}
        />
      </motion.span>
    </div>
  );
}
