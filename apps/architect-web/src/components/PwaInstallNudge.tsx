import { Download, X } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';

import ExternalLink from '~/components/ExternalLink';
import Button, { IconButton } from '~/lib/legacy-ui/components/Button';
import { cx } from '~/utils/cva';
import {
  getDeferredPrompt,
  promptInstall,
  subscribeInstallPrompt,
} from '~/utils/installPrompt';

const DISMISSED_KEY = 'architect:pwa-install-nudge-dismissed';
const LEARN_MORE_URL = 'https://documentation.networkcanvas.com';

const readDismissed = () => {
  try {
    return localStorage.getItem(DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
};

const PwaInstallNudge = () => {
  const deferredPrompt = useSyncExternalStore(
    subscribeInstallPrompt,
    getDeferredPrompt,
  );
  const [dismissed, setDismissed] = useState(readDismissed);

  if (!deferredPrompt || dismissed) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, 'true');
    } catch {
      // Private mode etc.: still hide for this session.
    }
    setDismissed(true);
  };

  return (
    <aside
      aria-label="Install Architect"
      className={cx(
        'fixed right-(--space-md) bottom-(--space-md) z-(--z-global-ui)',
        'flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-(--space-sm)',
        'border-border bg-surface-1 text-surface-1-foreground rounded border p-(--space-md) shadow-lg',
      )}
    >
      <IconButton
        variant="text"
        size="small"
        aria-label="Dismiss"
        className="absolute top-(--space-xs) right-(--space-xs)"
        onClick={dismiss}
        icon={<X />}
      />
      <p className="m-0 pr-(--space-lg) text-sm">
        Did you know that you can install Architect Web and use it like an app
        (even offline)?
      </p>
      <div className="flex items-center gap-(--space-md)">
        <Button
          color="sea-green"
          size="small"
          onClick={() => void promptInstall()}
        >
          <Download />
          Install
        </Button>
        <ExternalLink href={LEARN_MORE_URL}>Learn more</ExternalLink>
      </div>
    </aside>
  );
};

export default PwaInstallNudge;
