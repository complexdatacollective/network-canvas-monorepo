import { Database, Settings, Upload } from 'lucide-react';
import { motion } from 'motion/react';

import { Button, IconButton } from '@codaco/fresco-ui/Button';

const EASE = [0.22, 1, 0.36, 1] as const;

// Glass-pill treatment layered over the standard Button: backdrop-blur surface
// with the theme outline, sized to match BrandHeader's height (h-14).
const GLASS_PILL =
  'h-14 rounded-full border border-outline bg-surface/85 backdrop-blur-md shadow-md';

type TopActionBarProps = {
  onOpenImport: () => void;
  onOpenData: () => void;
  onOpenSettings: () => void;
};

export function TopActionBar({
  onOpenImport,
  onOpenData,
  onOpenSettings,
}: TopActionBarProps) {
  return (
    <div className="flex items-center gap-3">
      <motion.span
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.18, ease: EASE }}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.97 }}
        className="inline-flex"
      >
        <Button
          variant="text"
          icon={<Upload size={18} strokeWidth={2.6} aria-hidden />}
          onClick={onOpenImport}
          className={`${GLASS_PILL} gap-2.5 px-6`}
        >
          Import
        </Button>
      </motion.span>
      <motion.span
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.25, ease: EASE }}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.97 }}
        className="inline-flex"
      >
        <Button
          variant="text"
          icon={<Database size={18} strokeWidth={2.5} aria-hidden />}
          onClick={onOpenData}
          className={`${GLASS_PILL} gap-2.5 px-6`}
        >
          Data
        </Button>
      </motion.span>
      <motion.span
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.32, ease: EASE }}
        whileHover={{ y: -2, rotate: -8 }}
        whileTap={{ scale: 0.94 }}
        className="inline-flex"
      >
        <IconButton
          variant="text"
          icon={<Settings size={22} strokeWidth={2.4} aria-hidden />}
          aria-label="Settings"
          onClick={onOpenSettings}
          className={`${GLASS_PILL} w-14`}
        />
      </motion.span>
    </div>
  );
}
