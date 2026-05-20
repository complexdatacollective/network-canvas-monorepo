import { Lock, Settings } from 'lucide-react';
import { motion } from 'motion/react';

import { IconButton } from '@codaco/fresco-ui/Button';
import { ViewSwitcher } from '~/components/ViewSwitcher';
import { useAuth } from '~/lib/auth/AuthContext';

const EASE = [0.22, 1, 0.36, 1] as const;

// Glass-pill treatment layered over the standard Button: backdrop-blur surface
// with the theme outline, sized to match BrandHeader's height (h-14).
export const GLASS_PILL =
  'border border-outline bg-surface/50 backdrop-blur-md shadow-md uppercase text-sm font-black';

type TopActionBarProps = {
  onOpenSettings: () => void;
};

export function TopActionBar({ onOpenSettings }: TopActionBarProps) {
  const { mode, lock } = useAuth();
  const showLock = mode !== undefined && mode !== 'none';

  return (
    <div className="flex items-center gap-3">
      <ViewSwitcher />
      {showLock && (
        <motion.span
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.32, ease: EASE }}
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
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.39, ease: EASE }}
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
