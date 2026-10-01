'use client';

import { WifiOff } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { AppMessage } from '@codaco/app-i18n/react';
import { Badge } from '@codaco/fresco-ui/Badge';

import useOnline from '../hooks/useOnline';
import { runtimeMessages as messages } from '../i18n/runtimeMessages';

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
        <Badge
          render={
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            />
          }
          role="status"
          aria-live="polite"
          size="lg"
          icon={<WifiOff className="size-4 shrink-0" aria-hidden />}
          className="bg-surface/90 text-surface-contrast pointer-events-none absolute top-4 left-1/2 z-30 -translate-x-1/2 px-4 py-2 font-normal shadow-lg backdrop-blur-md"
        >
          <span>
            <AppMessage message={messages.offlineMap} />
          </span>
        </Badge>
      )}
    </AnimatePresence>
  );
}
