import { useEffect } from 'react';
import { useLocation } from 'wouter';

import BackgroundLights from '~/components/BackgroundLights';
import DialogManager from '~/components/DialogManager';
import InstallBanner from '~/components/InstallBanner';
import { JsonPreviewOverlay } from '~/components/JsonPreviewOverlay';
import ProtocolGuardedRouter from '~/components/ProtocolGuardedRouter';
import PwaUpdateBanner from '~/components/PwaUpdateBanner';
import Routes from '~/components/Routes';
import ScrollToTop from '~/components/ScrollToTop';
import { resetRunOnce } from '~/hooks/useRunOnce';

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
      {/* The update banner registers the service worker (so the app is
          installable) and prompts on updates; the install banner urges
          installation when running in a browser tab. Each self-hides when
          not applicable. */}
      <PwaUpdateBanner />
      <InstallBanner />
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
