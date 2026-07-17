import { WifiOff } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import useOnline from '../hooks/useOnline';

// Persistent banner shown while a Geospatial stage is on screen and the device
// is offline. The map will not load without a connection, so this is a
// standing signal (not a transient toast). aria-live announces it when it
// appears; it auto-dismisses when connectivity returns or the stage changes.
export function GeospatialOfflineIndicator({ active }: { active: boolean }) {
  const isOnline = useOnline();
  const show = active && !isOnline;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="bg-surface/90 text-surface-contrast pointer-events-none absolute top-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-sm shadow-lg backdrop-blur-md"
        >
          <WifiOff className="size-4 shrink-0" aria-hidden />
          <span>
            You are offline — the map will not load until you reconnect.
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
