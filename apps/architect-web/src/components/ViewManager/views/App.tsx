import { useEffect } from 'react';
import { useLocation } from 'wouter';

import BackgroundLights from '~/components/BackgroundLights';
import DialogManager from '~/components/DialogManager';
import { JsonPreviewOverlay } from '~/components/JsonPreviewOverlay';
import ProtocolGuardedRouter from '~/components/ProtocolGuardedRouter';
import PwaInstallNudge from '~/components/PwaInstallNudge';
import PwaUpdateBanner from '~/components/PwaUpdateBanner';
import Routes from '~/components/Routes';
import ScrollToTop from '~/components/ScrollToTop';
import { resetRunOnce } from '~/hooks/useRunOnce';
import { isRunningAsInstalledPwa } from '~/utils/pwa';

// Evaluated once at startup: a window's display mode is fixed for its lifetime,
// and recomputing per render would let a transient mode change (e.g. entering
// fullscreen) flip this true and register the service worker in a browser tab.
const OFFLINE_ENABLED = isRunningAsInstalledPwa();

const AppContents = () => {
  const [location] = useLocation();

  // Returning to the start screen ends the current protocol session, so the
  // next /protocol visit gets a fresh entrance animation.
  useEffect(() => {
    if (location === '/') resetRunOnce();
  }, [location]);

  const lightsIntensity =
    location === '/'
      ? 'bold'
      : location.startsWith('/protocol/stage/')
        ? 'dim'
        : 'medium';

  return (
    <>
      <BackgroundLights intensity={lightsIntensity} />
      <ScrollToTop />
      <Routes />
      <DialogManager />
      {OFFLINE_ENABLED ? <PwaUpdateBanner /> : <PwaInstallNudge />}
      <JsonPreviewOverlay />
    </>
  );
};

const AppView = () => (
  <ProtocolGuardedRouter>
    <AppContents />
  </ProtocolGuardedRouter>
);

export default AppView;
