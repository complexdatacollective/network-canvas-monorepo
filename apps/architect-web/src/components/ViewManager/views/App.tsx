import { useEffect } from 'react';
import { useLocation } from 'wouter';

import DialogManager from '~/components/DialogManager';
import { JsonPreviewOverlay } from '~/components/JsonPreviewOverlay';
import Routes from '~/components/Routes';
import ScrollToTop from '~/components/ScrollToTop';
import { resetRunOnce } from '~/hooks/useRunOnce';

const AppView = () => {
  const [location] = useLocation();

  // Returning to the start screen ends the current protocol session, so the
  // next /protocol visit gets a fresh entrance animation.
  useEffect(() => {
    if (location === '/') resetRunOnce();
  }, [location]);

  return (
    <>
      <ScrollToTop />
      <Routes />
      <DialogManager />
      <JsonPreviewOverlay />
    </>
  );
};

export default AppView;
