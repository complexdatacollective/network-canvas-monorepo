import { useEffect } from 'react';
import { useLocation } from 'wouter';

import BackgroundLights from '~/components/BackgroundLights';
import DialogManager from '~/components/DialogManager';
import { JsonPreviewOverlay } from '~/components/JsonPreviewOverlay';
import ProtocolGuardedRouter from '~/components/ProtocolGuardedRouter';
import PwaUpdateBanner from '~/components/PwaUpdateBanner';
import Routes from '~/components/Routes';
import ScrollToTop from '~/components/ScrollToTop';
import { resetRunOnce } from '~/hooks/useRunOnce';
import { isRunningAsInstalledPwa } from '~/utils/pwa';

const AppContents = () => {
  const [location] = useLocation();

  // Offline support (service-worker registration, caching, and the update
  // prompt) is enabled only when running as an installed PWA. In a normal
  // browser tab the app stays online-only, so the banner — which registers the
  // service worker via useRegisterSW — is not mounted.
  const offlineEnabled = isRunningAsInstalledPwa();

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
      {offlineEnabled && <PwaUpdateBanner />}
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
