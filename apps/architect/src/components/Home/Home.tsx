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

import Button from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type {
  CurrentProtocol,
  ExtractedAsset,
} from '@codaco/protocol-validation';
import AppUpdatePill from '~/components/AppUpdate/AppUpdatePill';
import NewProtocolDialog from '~/components/NewProtocolDialog';
import NavShell from '~/components/ProjectNav/NavShell';
import { showProtocolOpenResultDialog } from '~/components/protocolOpenDialogs';
import { useAppDispatch } from '~/ducks/hooks';
import {
  createNetcanvas,
  openBundledTemplate,
  openLibraryProtocol,
  openLocalNetcanvas,
} from '~/ducks/modules/userActions/userActions';
import {
  BUNDLED_TEMPLATES,
  type BundledTemplate,
  type ProtocolSourceRef,
} from '~/templates';
import { loadSampleAssets, sampleProtocol } from '~/templates/sample-protocol';
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
  const { openDialog } = useDialog();
  const [isLoading, setIsLoading] = useState(false);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<{
    protocol: CurrentProtocol;
    defaultName: string;
    loadAssets?: () => Promise<ExtractedAsset[]>;
    sourceRef?: ProtocolSourceRef;
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
  const handleOpenLocalFile = useCallback(
    async (file: File) => {
      const result = await dispatch(openLocalNetcanvas({ file })).unwrap();
      await showProtocolOpenResultDialog({
        result,
        openDialog,
        onApproveMigration: async () => {
          const approvedResult = await dispatch(
            openLocalNetcanvas({ file, migrationApproved: true }),
          ).unwrap();
          await showProtocolOpenResultDialog({
            result: approvedResult,
            openDialog,
          });
        },
      });
    },
    [dispatch, openDialog],
  );
  const onDrop = (files: File[]) => {
    const file = files[0];
    if (file) {
      void runAction(async () => {
        await handleOpenLocalFile(file);
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
      sourceRef: { kind: 'sample', id: 'sample' },
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
          sourceRef: { kind: 'development', id: 'development' },
        });
      })();
    }
  }, []);
  const handleOpenTemplate = useCallback((template: BundledTemplate) => {
    setPendingTemplate({
      protocol: template.protocol,
      loadAssets: template.loadAssets,
      defaultName: template.name,
      sourceRef: template.sourceRef,
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
          void openDialog({
            type: 'acknowledge',
            intent: 'destructive',
            title: 'Protocol Import Error',
            description: message,
            actions: { primary: { label: 'OK', value: true } },
          });
          return;
        }
        const result = await dispatch(
          openBundledTemplate({
            protocol: template.protocol,
            name,
            assets,
            sourceRef: template.sourceRef,
          }),
        ).unwrap();
        await showProtocolOpenResultDialog({ result, openDialog });
      });
    },
    [dispatch, openDialog, pendingTemplate, runAction],
  );
  const handleOpenLibraryProtocol = useCallback(
    (id: string) => {
      void runAction(async () => {
        const result = await dispatch(openLibraryProtocol(id)).unwrap();
        await showProtocolOpenResultDialog({ result, openDialog });
      });
    },
    [dispatch, openDialog, runAction],
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

      <div
        {...getRootProps()}
        className="flex h-full min-w-0 flex-col overflow-x-hidden"
      >
        <input {...getInputProps()} />

        {/* Dropzone */}
        {isDragActive && (
          <div
            aria-hidden
            className="border-action bg-action/10 fixed inset-3 z-20 rounded-2xl border-4 border-dashed"
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
              <AppUpdatePill />
            </>
          }
        />

        {/* Hero section */}

        <main className="laptop:px-0 mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col overflow-x-hidden overflow-y-auto px-8 pb-8">
          <div className="tablet-portrait:flex-row laptop:gap-4 flex min-h-0 w-full min-w-0 flex-1 flex-col items-stretch gap-6">
            <div
              aria-hidden
              className="tablet-portrait:block tablet-portrait:w-1/2 laptop:w-[48%] pointer-events-none hidden h-full shrink-0"
            >
              <TransitMap stops={TIMELINE_SCRIPT} count={visibleCount} />
            </div>

            <div className="short:justify-start short:gap-3 laptop:gap-8 flex min-w-0 flex-1 flex-col items-start justify-center gap-6 text-left">
              <div className="short:gap-2 @container flex w-full flex-col items-start gap-4">
                <div>
                  <Heading
                    level="h1"
                    margin="none"
                    className="laptop:text-[clamp(3rem,9vh,6rem)] mb-3 text-[clamp(2.75rem,8vh,4.5rem)] leading-[0.95] tracking-tight"
                  >
                    Welcome to <span className="text-action">Architect</span>
                  </Heading>
                  <Paragraph
                    intent="lead"
                    margin="none"
                    className="text-muted short:hidden max-w-xl"
                  >
                    Architect is the protocol designer for Network Canvas.
                    Compose name generators, capture ordinal and categorical
                    data, map connections, and explore narratives.
                  </Paragraph>
                </div>

                <div className="flex w-full flex-col items-start gap-3 @min-[40rem]:flex-row @min-[40rem]:flex-nowrap">
                  <Button
                    size="md"
                    color="primary"
                    onClick={() => setShowNewDialog(true)}
                  >
                    <FilePlus />
                    Create a new protocol
                  </Button>
                  <Button
                    size="md"
                    className="focus:outline-accent [--component-bg:var(--accent-contrast)] [--component-text:var(--accent)]"
                    onClick={openFileDialog}
                  >
                    <FolderOpen />
                    Open existing protocol
                  </Button>
                </div>

                <Paragraph className="hint my-0 flex items-center gap-1.5">
                  <Upload className="h-3.5 w-3.5" />
                  Or drop a <code className="code">.netcanvas</code> file
                  anywhere on this page
                </Paragraph>
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
