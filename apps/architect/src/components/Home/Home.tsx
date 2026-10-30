import { BookOpen, CodeXml, FilePlus, FolderOpen, Users } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useId, useState } from 'react';
import { ErrorCode, type FileRejection, useDropzone } from 'react-dropzone';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
import type { ChoiceDialog } from '@codaco/fresco-ui/dialogs/DialogProvider';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type {
  CurrentProtocol,
  ExtractedAsset,
} from '@codaco/protocol-validation';
import AppUpdatePill from '~/components/AppUpdate/AppUpdatePill';
import NewProtocolDialog from '~/components/NewProtocolDialog';
import NavLink from '~/components/ProjectNav/NavLink';
import NavShell from '~/components/ProjectNav/NavShell';
import { showProtocolOpenResultDialog } from '~/components/protocolOpenDialogs';
import {
  confirmLegacyProtocolUpgrade,
  openInLegacyArchitect,
  openLegacyLibraryProtocol,
  openNetcanvasFile,
} from '~/components/protocolOpenFlow';
import { routeFocusTargetProps } from '~/components/RouteFocus';
import { useAppDispatch } from '~/ducks/hooks';
import {
  createNetcanvas,
  openBundledTemplate,
  openLibraryProtocol,
  type ProtocolOpenResult,
} from '~/ducks/modules/userActions/userActions';
import { formatConfig } from '~/i18n/formatConfig';
import {
  BUNDLED_TEMPLATES,
  type BundledTemplate,
  type ProtocolSourceRef,
} from '~/templates';
import { loadSampleAssets, sampleProtocol } from '~/templates/sample-protocol';
import { documentationLinks } from '~/utils/documentationLinks';
import {
  describeImportFailure,
  getImportFailureKind,
  TEMPLATE_OPEN_FAILURE_MESSAGE,
} from '~/utils/protocolImportErrors';
import { reportError } from '~/utils/reportError';

import LibraryPanel from './LibraryPanel';
import ProtocolLoadingOverlay from './ProtocolLoadingOverlay';
import { TIMELINE_SCRIPT } from './timelineScript';
import TransitMap from './TransitMap';

// Rich-text tag renderers live at module scope so they keep one identity across
// renders (an inline arrow returning JSX is a component defined during render).
const renderActionSpan = (chunks: ReactNode[]) => (
  <span className="text-action">{chunks}</span>
);

const renderCode = (chunks: ReactNode[]) => (
  <code className="code">{chunks}</code>
);

const configMessages = defineMessages({
  docs: {
    id: 'architect.home.home.config.docs',
    defaultMessage: 'Docs',
    description:
      'Presentation label or description in components/Home/Home.tsx. Identifiers are not translated.',
  },
  community: {
    id: 'architect.home.home.config.community',
    defaultMessage: 'Community',
    description:
      'Presentation label or description in components/Home/Home.tsx. Identifiers are not translated.',
  },
});
const messages = defineMessages({
  protocolImportError: {
    id: 'architect.home.home.protocolImportError',
    defaultMessage: 'Protocol Import Error',
    description: 'The title text in components / Home / Home.',
  },
  nameYourProtocol: {
    id: 'architect.home.home.nameYourProtocol',
    defaultMessage: 'Name your protocol',
    description: 'The title text in components / Home / Home.',
  },
  welcomeToArchitect: {
    id: 'architect.home.home.welcomeToArchitect',
    defaultMessage: 'Welcome to <span>Architect</span>',
    description: 'Visible text in components / Home / Home.',
  },
  architectIsTheProtocolDesignerFor: {
    id: 'architect.home.home.architectIsTheProtocolDesignerFor',
    defaultMessage:
      'Architect is the protocol designer for Network Canvas. Compose name generators, capture ordinal and categorical data, map connections, and explore narratives.',
    description: 'Visible text in components / Home / Home.',
  },
  createANewProtocol: {
    id: 'architect.home.home.createANewProtocol',
    defaultMessage: 'Create a new protocol',
    description: 'Visible text in components / Home / Home.',
  },
  openExistingProtocol: {
    id: 'architect.home.home.openExistingProtocol',
    defaultMessage: 'Open existing protocol',
    description: 'Visible text in components / Home / Home.',
  },
  orDropANetcanvasFileAnywhere: {
    id: 'architect.home.home.orDropANetcanvasFileAnywhere',
    defaultMessage:
      'Or drop a <code>.netcanvas</code> file anywhere on this page',
    description:
      'Second, smaller line inside the "Open existing protocol" button on the Architect start screen, telling researchers they can also drag a protocol file onto the page. <code> wraps the file extension, which stays untranslated.',
  },
});

const NAV_LINKS = [
  {
    href: documentationLinks.home,
    label: configMessages.docs,
    Icon: BookOpen,
  },
  {
    href: 'https://community.networkcanvas.com',
    label: configMessages.community,
    Icon: Users,
  },
  {
    href: 'https://github.com/complexdatacollective',
    label: 'GitHub',
    Icon: CodeXml,
  },
];
const Home = () => {
  const intl = useAppIntl();
  const dispatch = useAppDispatch();
  const { openDialog } = useDialog();
  const [isLoading, setIsLoading] = useState(false);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const dropHintId = useId();
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
  // The loading overlay covers async work (dispatch, asset loading) only. It
  // must be dismissed before any dialog is awaited, otherwise the spinner
  // (rendered at a high z-index) paints over the dialog and blocks its buttons.
  const runAction = useCallback(
    async <T,>(action: () => Promise<T>): Promise<T> => {
      setIsLoading(true);
      try {
        return await action();
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );
  const handleCreate = useCallback(
    (values: {
      name: string;
      localization: CurrentProtocol['localization'];
    }) => {
      setShowNewDialog(false);
      void runAction(async () => {
        await dispatch(createNetcanvas(values));
      });
    },
    [dispatch, runAction],
  );
  const handleOpenLocalFile = useCallback(
    async (file: File) => {
      await openNetcanvasFile({ file, dispatch, openDialog, runAction });
    },
    [dispatch, openDialog, runAction],
  );
  const onDrop = (files: File[], fileRejections: readonly FileRejection[]) => {
    // With `multiple: false`, react-dropzone accepts the first file of a
    // multi-file drop and rejects the rest as too-many-files. Which file came
    // "first" is arbitrary to the researcher, so a multi-file drop opens nothing.
    const tooManyFilesCode: string = ErrorCode.TooManyFiles;
    if (
      fileRejections.some(({ errors }) =>
        errors.some(({ code }) => code === tooManyFilesCode),
      )
    ) {
      return;
    }
    const file = files[0];
    if (file) {
      void handleOpenLocalFile(file);
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
      void (async () => {
        let result: ProtocolOpenResult;
        try {
          result = await runAction(async () => {
            const assets: ExtractedAsset[] | undefined = template.loadAssets
              ? await template.loadAssets()
              : undefined;
            return dispatch(
              openBundledTemplate({
                protocol: template.protocol,
                name,
                assets,
                sourceRef: template.sourceRef,
              }),
            ).unwrap();
          });
        } catch (error) {
          // Only report what Architect cannot describe. A storage failure is
          // reachable here and is a fact about the researcher's device, not a
          // defect; sending it to exception tracking buries the ones that are.
          if (getImportFailureKind(error) === null) {
            reportError(error);
          }
          // This branch is the template's own asset loading and the thunk's
          // rejection — never an archive — so the default talks about the
          // template. `describeImportFailure` still runs first because a
          // storage failure is reachable here and describes itself better.
          await showProtocolOpenResultDialog({
            result: {
              status: 'error',
              title: createMessageError(messages.protocolImportError),
              ...describeImportFailure(error, TEMPLATE_OPEN_FAILURE_MESSAGE),
            },
            openDialog,
          });
          return;
        }
        await showProtocolOpenResultDialog({ result, openDialog });
      })();
    },
    [dispatch, openDialog, pendingTemplate, runAction],
  );
  const handleOpenLibraryProtocol = useCallback(
    (id: string) => {
      void (async () => {
        const result = await runAction(() =>
          dispatch(openLibraryProtocol({ id })).unwrap(),
        );
        await showProtocolOpenResultDialog({ result, openDialog });
      })();
    },
    [dispatch, openDialog, runAction],
  );
  // Protocols listed from Architect 8's library. Each runs the shared open
  // flow, which shows its own dialogs outside `runAction`.
  const handleOpenLegacyProtocol = useCallback(
    (legacyId: string, finalFocus?: ChoiceDialog['finalFocus']) => {
      void openLegacyLibraryProtocol({
        legacyId,
        dispatch,
        openDialog,
        runAction,
        finalFocus,
      });
    },
    [dispatch, openDialog, runAction],
  );
  const handleUpgradeLegacyProtocol = useCallback(
    (legacyId: string, finalFocus?: ChoiceDialog['finalFocus']) => {
      void confirmLegacyProtocolUpgrade({
        legacyId,
        dispatch,
        openDialog,
        runAction,
        finalFocus,
      });
    },
    [dispatch, openDialog, runAction],
  );
  const handleOpenInLegacyArchitect = useCallback(
    (legacyId: string) => {
      void openInLegacyArchitect({ legacyId, dispatch, openDialog });
    },
    [dispatch, openDialog],
  );
  return (
    <>
      <ProtocolLoadingOverlay open={isLoading} />
      <NewProtocolDialog
        open={showNewDialog}
        onOpenChange={setShowNewDialog}
        chooseLanguages
        onSubmit={handleCreate}
      />
      <NewProtocolDialog
        open={pendingTemplate !== null}
        onOpenChange={(open) => {
          if (!open) setPendingTemplate(null);
        }}
        onSubmit={handleConfirmTemplate}
        title={intl.formatMessage(messages.nameYourProtocol)}
        initialName={pendingTemplate?.defaultName}
      />

      <div
        {...getRootProps()}
        className="flex h-full min-w-0 flex-col overflow-x-hidden"
      >
        <input {...getInputProps()} aria-hidden="true" tabIndex={-1} />

        {/* Dropzone */}
        {isDragActive && (
          <div
            aria-hidden
            className="border-action bg-action/10 fixed inset-3 z-20 rounded-2xl border-4 border-dashed"
          />
        )}

        <NavShell
          items={formatConfig(NAV_LINKS, intl).map(({ href, label, Icon }) => (
            <NavLink
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="relative inline-flex items-center gap-2">
                <Icon className="size-4 shrink-0" aria-hidden />
                {label}
              </span>
            </NavLink>
          ))}
          end={<AppUpdatePill />}
        />

        {/* Hero section */}

        <main className="laptop:px-0 mx-auto mt-8 flex min-h-0 w-full max-w-7xl flex-1 flex-col overflow-x-hidden overflow-y-auto px-8 pb-8">
          <div className="tablet-landscape:flex-row laptop:gap-4 flex min-h-0 w-full min-w-0 flex-1 flex-col items-stretch gap-6">
            <div
              aria-hidden
              className="tablet-landscape:block desktop:w-1/2 pointer-events-none hidden h-full w-2/5 shrink-0"
            >
              <TransitMap
                stops={formatConfig(TIMELINE_SCRIPT, intl)}
                count={visibleCount}
              />
            </div>

            <div className="short:gap-3 laptop:gap-8 @container-size flex h-full min-w-0 flex-1 flex-col items-start justify-start gap-6 text-left">
              <div className="flex w-full flex-col items-start gap-8">
                <div className="flex w-full flex-col items-start gap-4">
                  <Heading
                    level="h1"
                    variant="display-heading"
                    margin="none"
                    className="leading-[0.92] font-black tracking-tight"
                    {...routeFocusTargetProps}
                  >
                    {intl.formatMessage(messages.welcomeToArchitect, {
                      span: renderActionSpan,
                    })}
                  </Heading>
                  <Paragraph
                    intent="lead"
                    emphasis="muted"
                    margin="none"
                    className="hidden max-w-xl [@container_(height>760px)]:block"
                  >
                    {intl.formatMessage(
                      messages.architectIsTheProtocolDesignerFor,
                    )}
                  </Paragraph>
                </div>

                {/* Two equal columns spanning the library panel's width, which
                    stack when either would be too narrow. The row stretches both
                    buttons to the height of the open button and its drop hint;
                    labels wrap rather than truncate in longer languages. Each
                    icon sits inline at the start of its label, so it stays
                    beside the first word when the label wraps. */}
                <div className="grid w-full grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-3">
                  <Button
                    color="primary"
                    onClick={() => setShowNewDialog(true)}
                    className="h-auto min-h-12 py-3 @min-xl:min-h-16 @min-xl:text-lg"
                  >
                    <span className="text-balance whitespace-normal">
                      <FilePlus
                        strokeWidth={2.5}
                        className="me-3 inline h-[1em] w-auto align-[-0.125em]"
                      />
                      {intl.formatMessage(messages.createANewProtocol)}
                    </span>
                  </Button>
                  {/* The drop hint describes the button rather than naming it,
                      so it is hidden from the name and read as the description. */}
                  <Button
                    color="default"
                    variant="glass"
                    onClick={openFileDialog}
                    aria-describedby={dropHintId}
                    className="h-auto min-h-12 flex-col gap-1 border-transparent py-3 @min-xl:min-h-16 @min-xl:text-lg"
                  >
                    <span className="text-balance whitespace-normal">
                      <FolderOpen
                        strokeWidth={2.5}
                        className="me-3 inline h-[1em] w-auto align-[-0.125em]"
                      />
                      {intl.formatMessage(messages.openExistingProtocol)}
                    </span>
                    <span
                      id={dropHintId}
                      aria-hidden
                      className="font-body text-xs leading-snug font-normal tracking-normal text-balance whitespace-normal opacity-75"
                    >
                      {intl.formatMessage(
                        messages.orDropANetcanvasFileAnywhere,
                        { code: renderCode },
                      )}
                    </span>
                  </Button>
                </div>
              </div>

              <LibraryPanel
                templates={BUNDLED_TEMPLATES}
                onOpenProtocol={handleOpenLibraryProtocol}
                onOpenLegacyProtocol={handleOpenLegacyProtocol}
                onUpgradeLegacyProtocol={handleUpgradeLegacyProtocol}
                onOpenInLegacyArchitect={handleOpenInLegacyArchitect}
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
