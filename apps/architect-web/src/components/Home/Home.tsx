import {
  BookOpen,
  CodeXml,
  FilePlus,
  FolderOpen,
  Upload,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';

import type {
  CurrentProtocol,
  ExtractedAsset,
} from '@codaco/protocol-validation';
import Badge from '~/components/Badge';
import NewProtocolDialog from '~/components/NewProtocolDialog';
import NavShell from '~/components/ProjectNav/NavShell';
import { useAppDispatch } from '~/ducks/hooks';
import { generalErrorDialog } from '~/ducks/modules/userActions/dialogs';
import {
  createNetcanvas,
  openBundledTemplate,
  openLibraryProtocol,
  openLocalNetcanvas,
} from '~/ducks/modules/userActions/userActions';
import Button from '~/lib/legacy-ui/components/Button';
import { BUNDLED_TEMPLATES, type BundledTemplate } from '~/templates';
import { loadSampleAssets, sampleProtocol } from '~/templates/sample-protocol';
import { appVersion } from '~/utils/appVersion';
import { reportError } from '~/utils/reportError';

import LibraryPanel from './LibraryPanel';
import ProtocolLoadingOverlay from './ProtocolLoadingOverlay';
import { TIMELINE_SCRIPT } from './timelineScript';
import TransitMap from './TransitMap';

const NAV_LINKS = [
  {
    href: 'https://documentation.networkcanvas.com',
    label: 'Docs',
    Icon: BookOpen,
  },
  {
    href: 'https://community.networkcanvas.com',
    label: 'Community',
    Icon: Users,
  },
  {
    href: 'https://github.com/complexdatacollective',
    label: 'GitHub',
    Icon: CodeXml,
  },
];

const Home = () => {
  const dispatch = useAppDispatch();
  const [isLoading, setIsLoading] = useState(false);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<{
    protocol: CurrentProtocol;
    defaultName: string;
    loadAssets?: () => Promise<ExtractedAsset[]>;
  } | null>(null);
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

  const {
    getRootProps,
    getInputProps,
    isDragActive,
    open: openFileDialog,
  } = useDropzone({
    onDrop,
    accept: { 'application/octet-stream': ['.netcanvas'] },
    multiple: false,
    noClick: true,
    noKeyboard: true,
  });

  // Templates are named before opening, so the new library entry lands in
  // Recents under a user-chosen name. Selecting a template opens the naming
  // dialog; confirming it fetches and instantiates the protocol.
  const handleOpenSample = useCallback(() => {
    setPendingTemplate({
      protocol: sampleProtocol,
      loadAssets: loadSampleAssets,
      defaultName: 'Sample Protocol',
    });
  }, []);

  // Dev-only. The dynamic import sits behind `import.meta.env.DEV` so the
  // Development protocol and its bundled assets (a ~24 MB video) are tree-shaken
  // out of the production build entirely.
  const handleOpenDevProtocol = useCallback(() => {
    if (import.meta.env.DEV) {
      void (async () => {
        const { developmentProtocol, loadDevelopmentAssets } =
          await import('~/templates/development-protocol');
        setPendingTemplate({
          protocol: developmentProtocol,
          loadAssets: loadDevelopmentAssets,
          defaultName: 'Development Protocol',
        });
      })();
    }
  }, []);

  const handleOpenTemplate = useCallback((template: BundledTemplate) => {
    setPendingTemplate({
      protocol: template.protocol,
      loadAssets: template.loadAssets,
      defaultName: template.name,
    });
  }, []);

  const handleConfirmTemplate = useCallback(
    ({ name }: { name: string }) => {
      const template = pendingTemplate;
      setPendingTemplate(null);
      if (!template) return;
      void runAction(async () => {
        let assets: ExtractedAsset[] | undefined;
        try {
          assets = template.loadAssets
            ? await template.loadAssets()
            : undefined;
        } catch (error) {
          const { message } = reportError(error);
          dispatch(generalErrorDialog('Protocol Import Error', message));
          return;
        }
        await dispatch(
          openBundledTemplate({ protocol: template.protocol, name, assets }),
        );
      });
    },
    [dispatch, pendingTemplate, runAction],
  );

  const handleOpenLibraryProtocol = useCallback(
    (id: string) => {
      void runAction(async () => {
        await dispatch(openLibraryProtocol(id));
      });
    },
    [dispatch, runAction],
  );

  return (
    <>
      <ProtocolLoadingOverlay open={isLoading} />
      <NewProtocolDialog
        open={showNewDialog}
        onOpenChange={setShowNewDialog}
        onSubmit={handleCreate}
      />
      <NewProtocolDialog
        open={pendingTemplate !== null}
        onOpenChange={(open) => {
          if (!open) setPendingTemplate(null);
        }}
        onSubmit={handleConfirmTemplate}
        title="Name your protocol"
        initialName={pendingTemplate?.defaultName}
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

        <NavShell
          trailing={
            <>
              {NAV_LINKS.map(({ href, label, Icon }) => (
                <a
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-action relative cursor-pointer text-base leading-none font-semibold text-current no-underline transition-colors"
                >
                  <span className="relative inline-flex items-center gap-2">
                    <Icon className="size-4 shrink-0" aria-hidden />
                    {label}
                  </span>
                </a>
              ))}
              <Badge color="platinum">
                <span className="bg-active h-2 w-2 rounded-full" />v{appVersion}
              </Badge>
            </>
          }
        />

        {/* Hero section */}

        <main className="short:gap-4 mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-8 overflow-y-auto px-8 pb-8 xl:gap-12 xl:px-12">
          <div className="flex min-h-0 w-full flex-1 flex-col items-stretch gap-8 md:flex-row">
            <div
              aria-hidden
              className="pointer-events-none hidden h-full shrink-0 md:block md:w-1/2"
            >
              <TransitMap stops={TIMELINE_SCRIPT} count={visibleCount} />
            </div>

            <div className="short:justify-start short:gap-3 flex flex-1 flex-col items-start justify-center gap-6 text-left xl:gap-8">
              <div className="short:gap-2 flex flex-col items-start gap-4">
                <div>
                  <h1 className="hero mb-3 xl:text-[clamp(3rem,9vh,6rem)]">
                    Welcome to <span className="text-action">Architect</span>
                  </h1>
                  <p className="lead short:hidden my-0 max-w-xl">
                    Architect is the protocol designer for Network Canvas.
                    Compose name generators, capture ordinal and categorical
                    data, map connections, and explore narratives.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    size="large"
                    color="sea-green"
                    onClick={() => setShowNewDialog(true)}
                  >
                    <FilePlus />
                    Create a new protocol
                  </Button>
                  <Button
                    size="large"
                    color="slate-blue"
                    onClick={openFileDialog}
                  >
                    <FolderOpen />
                    Open existing protocol
                  </Button>
                </div>

                <p className="hint my-0 flex items-center gap-1.5">
                  <Upload className="h-3.5 w-3.5" />
                  Or drop a <code className="code">.netcanvas</code> file
                  anywhere on this page
                </p>
              </div>

              <LibraryPanel
                templates={BUNDLED_TEMPLATES}
                onOpenProtocol={handleOpenLibraryProtocol}
                onOpenSample={handleOpenSample}
                onOpenDevProtocol={handleOpenDevProtocol}
                onOpenTemplate={handleOpenTemplate}
              />
            </div>
          </div>
        </main>
      </div>
    </>
  );
};

export default Home;
