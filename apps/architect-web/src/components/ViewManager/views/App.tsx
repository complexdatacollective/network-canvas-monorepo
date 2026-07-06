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
import { useProtocolTabLock } from '~/hooks/useProtocolTabLock';
import { resetRunOnce } from '~/hooks/useRunOnce';

const AppContents = () => {
  const [location] = useLocation();

  // Hold the cross-tab single-editor lock while this tab is in the protocol
  // editor, releasing it on the start screen.
  useProtocolTabLock();

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
      {/* Viewport-tall column so the install banner reserves space in normal
          flow (rather than a fixed overlay that covered the sticky nav): the
          banner is a shrink-0 strip at the top and each route fills the rest. */}
      <div className="flex h-dvh flex-col">
        {/* The install banner urges installation when running in a browser tab;
            it self-hides (rendering nothing) when installed or dismissed. */}
        <InstallBanner />
        <div className="min-h-0 flex-1">
          <Routes />
        </div>
      </div>
      <DialogManager />
      {/* The update banner registers the service worker (so the app is
          installable) and prompts on updates. */}
      <PwaUpdateBanner />
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
