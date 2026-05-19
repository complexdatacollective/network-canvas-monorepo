import { useEffect } from 'react';
import { useLocation } from 'wouter';

import BackgroundBlobsLayer from '~/components/BackgroundBlobsLayer';
import DialogManager from '~/components/DialogManager';
import { JsonPreviewOverlay } from '~/components/JsonPreviewOverlay';
import ProtocolGuardedRouter from '~/components/ProtocolGuardedRouter';
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

  return (
    <>
      <BackgroundBlobsLayer intensity={location === '/' ? 'bold' : 'dim'} />
      <ScrollToTop />
      <Routes />
      <DialogManager />
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
