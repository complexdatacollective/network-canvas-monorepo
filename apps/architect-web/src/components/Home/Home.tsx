import { FilePlus, FolderOpen, Upload } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';

import NewProtocolDialog from '~/components/NewProtocolDialog';
import { SAMPLE_PROTOCOL_URL } from '~/config';
import { useAppDispatch } from '~/ducks/hooks';
import {
  createNetcanvas,
  openLocalNetcanvas,
  openRemoteNetcanvas,
} from '~/ducks/modules/userActions/userActions';
import Button from '~/lib/legacy-ui/components/Button';

import DevTools from './DevTools';
import Header from './Header';
import ProtocolLoadingOverlay from './ProtocolLoadingOverlay';
import { TIMELINE_SCRIPT } from './timelineScript';
import TransitMap from './TransitMap';

const Home = () => {
  const dispatch = useAppDispatch();
  const [isLoading, setIsLoading] = useState(false);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [visibleCount, setVisibleCount] = useState(3);

  useEffect(() => {
    const id = setInterval(() => setVisibleCount((c) => c + 1), 2400);
    return () => clearInterval(id);
  }, []);

  const runAction = useCallback(async (action: () => Promise<unknown>) => {
    setIsLoading(true);
    try {
      await action();
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleCreate = useCallback(
    (values: { name: string; description?: string }) => {
      setShowNewDialog(false);
      void runAction(async () => {
        await dispatch(createNetcanvas(values));
      });
    },
    [dispatch, runAction],
  );

  const onDrop = (files: File[]) => {
    const file = files[0];
    if (file) {
      void runAction(async () => {
        await dispatch(openLocalNetcanvas(file));
      });
    }
  };

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: { 'application/octet-stream': ['.netcanvas'] },
    multiple: false,
    noClick: true,
    noKeyboard: true,
  });

  const handleOpenSample = () => {
    void runAction(async () => {
      await dispatch(openRemoteNetcanvas(SAMPLE_PROTOCOL_URL));
    });
  };

  return (
    <>
      <ProtocolLoadingOverlay open={isLoading} />
      <NewProtocolDialog
        open={showNewDialog}
        onOpenChange={setShowNewDialog}
        onSubmit={handleCreate}
      />

      <div {...getRootProps()} className="flex h-dvh flex-col">
        <input {...getInputProps()} />

        {/* Dropzone */}
        {isDragActive && (
          <div
            aria-hidden
            className="border-action bg-action/10 fixed inset-3 z-(--z-global-ui) rounded-2xl border-4 border-dashed"
          />
        )}

        <Header />

        {/* Hero section */}

        <main className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-8 overflow-y-auto px-8 pb-8">
          <div className="flex min-h-0 w-full flex-1 flex-col items-start gap-8 md:flex-row">
            <div
              aria-hidden
              className="pointer-events-none hidden h-full shrink-0 md:block md:w-1/2"
            >
              <TransitMap stops={TIMELINE_SCRIPT} count={visibleCount} />
            </div>

            <div className="flex flex-1 flex-col items-start gap-6 pt-12 text-left">
              <div>
                <h1 className="hero mb-3">
                  Welcome to <span className="text-action">Architect</span>
                </h1>
                <p className="lead max-w-xl">
                  Architect is the protocol designer for Network Canvas. Compose
                  name generators, capture ordinal and categorical data, map
                  connections, and explore narratives.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <Button
                  size="large"
                  color="sea-green"
                  onClick={() => setShowNewDialog(true)}
                >
                  <FilePlus />
                  Create a new protocol
                </Button>
                <Button size="large" color="slate-blue" onClick={open}>
                  <FolderOpen />
                  Open existing protocol
                </Button>
              </div>

              <div>
                <p className="text-sm">
                  First time?{' '}
                  <button
                    type="button"
                    onClick={handleOpenSample}
                    className="action-link"
                  >
                    Explore a sample protocol
                  </button>
                </p>
                <p className="hint flex items-center gap-1.5">
                  <Upload className="h-3.5 w-3.5" />
                  Or drop a <code className="code">.netcanvas</code> file
                  anywhere on this page
                </p>
              </div>
            </div>
          </div>
        </main>

        <DevTools runAction={runAction} />
      </div>
    </>
  );
};

export default Home;
