import {
  Download,
  Ellipsis,
  FolderOpen,
  Info,
  Loader2,
  Trash2,
} from 'lucide-react';
import { DateTime } from 'luxon';
import { type ReactNode, useCallback, useEffect, useState } from 'react';

import Table from '~/components/Assets/Table';
import Badge from '~/components/Badge';
import ExternalLink from '~/components/ExternalLink';
import Dialog from '~/components/NewComponents/Dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/NewComponents/Popover';
import {
  Tabs,
  TabsList,
  TabsPanel,
  TabsTab,
} from '~/components/NewComponents/Tabs';
import Tooltip from '~/components/NewComponents/Tooltip';
import { useAppDispatch } from '~/ducks/hooks';
import { openDialog } from '~/ducks/modules/dialogs';
import { deleteLibraryProtocol } from '~/ducks/modules/userActions/userActions';
import { useProtocolLibrary } from '~/hooks/useProtocolLibrary';
import fileIcon from '~/images/file-icon.svg';
import { IconButton } from '~/lib/legacy-ui/components/Button';
import type { BundledTemplate } from '~/templates';
import { clearAllStorage, type StoredProtocolRow } from '~/utils/assetDB';
import { getProtocolAssetCount } from '~/utils/assetUtils';
import { downloadProtocolAsNetcanvas } from '~/utils/bundleProtocol';
import { documentationLinks } from '~/utils/documentationLinks';

type Tab = 'recent' | 'templates';

const RELATIVE_CUTOFF_DAYS = 7;

const formatTimestamp = (millis: number): string => {
  const dt = DateTime.fromMillis(millis);
  const secondsAgo = -dt.diffNow('seconds').seconds;
  if (secondsAgo < 60) {
    return '< 1 min ago';
  }
  const absolute = dt.toLocaleString({
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  if (secondsAgo < RELATIVE_CUTOFF_DAYS * 86_400) {
    return dt.toRelative() ?? absolute;
  }
  return absolute;
};

type MetaStat = { label: string; value: string };

const formatProtocolMeta = (protocol: StoredProtocolRow): string => {
  const stageCount = protocol.protocol.stages.length;
  return [
    `${stageCount} ${stageCount === 1 ? 'stage' : 'stages'}`,
    `Added ${formatTimestamp(protocol.createdAt)}`,
    `Edited ${formatTimestamp(protocol.updatedAt)}`,
  ].join(' · ');
};

const RowMenuItem = ({
  icon,
  label,
  onClick,
  disabled = false,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) => (
  <button
    type="button"
    role="menuitem"
    disabled={disabled}
    onClick={(event) => {
      event.stopPropagation();
      onClick();
    }}
    className="flex w-full items-center gap-(--space-sm) rounded-sm px-(--space-sm) py-(--space-xs) text-left text-sm transition-colors hover:bg-current/10 disabled:pointer-events-none disabled:opacity-50"
  >
    <span aria-hidden className="shrink-0 [&_svg]:size-4">
      {icon}
    </span>
    {label}
  </button>
);

type PanelRowProps = {
  name: string;
  description?: string;
  meta?: string;
  downloading?: boolean;
  onOpen: () => void;
  onDownload?: () => void;
  onDelete?: () => void;
  onShowInfo?: () => void;
};

const PanelRow = ({
  name,
  description,
  meta,
  downloading = false,
  onOpen,
  onDownload,
  onDelete,
  onShowInfo,
}: PanelRowProps) => {
  const [menuOpen, setMenuOpen] = useState(false);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    // Ignore keys on the inner action buttons so they don't also open the row.
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen();
    }
  };

  const runMenuAction = (action: () => void | Promise<void>) => () => {
    setMenuOpen(false);
    void Promise.resolve(action()).catch((error: unknown) => {
      console.error('LibraryPanel action failed', error);
    });
  };

  const hasMenu = Boolean(onDownload || onDelete || onShowInfo);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      className="group focusable hover:bg-surface-2 flex w-full shrink-0 cursor-pointer items-center gap-(--space-sm) rounded-sm px-(--space-md) py-(--space-sm) text-left transition-colors"
    >
      <img
        src={fileIcon}
        alt=""
        aria-hidden
        className="size-10 shrink-0 object-contain"
      />

      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{name}</span>
        {meta ? (
          <span className="text-muted-foreground block truncate text-sm">
            {meta}
          </span>
        ) : (
          description && (
            <span className="text-muted-foreground line-clamp-3 text-sm">
              {description}
            </span>
          )
        )}
      </span>

      {hasMenu && (
        <span className="flex shrink-0 items-center">
          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger asChild>
              <IconButton
                variant="text"
                aria-label={`Actions for ${name}`}
                disabled={downloading}
                onClick={(event) => event.stopPropagation()}
                icon={
                  downloading ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Ellipsis />
                  )
                }
              />
            </PopoverTrigger>
            <PopoverContent
              side="bottom"
              align="end"
              className="bg-surface-accent text-surface-accent-foreground min-w-48 p-(--space-xs)"
            >
              <RowMenuItem
                icon={<FolderOpen />}
                label="Open"
                onClick={runMenuAction(onOpen)}
              />
              {onShowInfo && (
                <RowMenuItem
                  icon={<Info />}
                  label="See more info"
                  onClick={runMenuAction(onShowInfo)}
                />
              )}
              {onDownload && (
                <RowMenuItem
                  icon={<Download />}
                  label="Download"
                  disabled={downloading}
                  onClick={runMenuAction(onDownload)}
                />
              )}
              {onDelete && (
                <RowMenuItem
                  icon={<Trash2 />}
                  label="Delete"
                  onClick={runMenuAction(onDelete)}
                />
              )}
            </PopoverContent>
          </Popover>
        </span>
      )}
    </div>
  );
};

type LibraryPanelProps = {
  // Open a saved protocol from the library.
  onOpenProtocol: (id: string) => void;
  // Open the bundled sample protocol.
  onOpenSample: () => void;
  // Open the development protocol (shown as a template in dev mode only).
  onOpenDevProtocol: () => void;
  // Research-grounded starter templates bundled with the app.
  templates: BundledTemplate[];
  // Open one of the bundled research templates.
  onOpenTemplate: (template: BundledTemplate) => void;
};

const PANEL_CLASSES =
  'h-[min(28rem,65dvh)] overflow-y-auto px-(--space-sm) pb-(--space-xl)';

const LibraryPanel = ({
  onOpenProtocol,
  onOpenSample,
  onOpenDevProtocol,
  templates,
  onOpenTemplate,
}: LibraryPanelProps) => {
  const dispatch = useAppDispatch();
  const { protocols, isLoaded } = useProtocolLibrary();
  // null until the user picks a tab; the default is chosen once the library has
  // loaded (Templates when there are no recents, Recent otherwise).
  const [tab, setTab] = useState<Tab | null>(null);
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [info, setInfo] = useState<{
    title: string;
    description?: string;
    stats: MetaStat[];
  } | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);

  useEffect(() => {
    if (tab === null && isLoaded) {
      setTab(protocols.length === 0 ? 'templates' : 'recent');
    }
  }, [tab, isLoaded, protocols.length]);

  const loadedDefault: Tab = protocols.length === 0 ? 'templates' : 'recent';
  const activeTab = tab ?? (isLoaded ? loadedDefault : null);

  const handleDownload = useCallback(
    async (protocol: StoredProtocolRow) => {
      setDownloadingIds((prev) => new Set(prev).add(protocol.id));
      try {
        await downloadProtocolAsNetcanvas(
          protocol.protocol,
          protocol.name,
          protocol.id,
        );
      } catch (error) {
        // Surface bundling/download failures instead of letting the promise
        // reject unhandled with no feedback. Not awaited so the spinner clears
        // immediately rather than waiting for the user to dismiss the dialog.
        void dispatch(
          openDialog({
            type: 'Error',
            title: 'Download failed',
            message: `"${protocol.name}" could not be downloaded.`,
            error: error instanceof Error ? error : String(error),
          }),
        );
      } finally {
        setDownloadingIds((prev) => {
          const next = new Set(prev);
          next.delete(protocol.id);
          return next;
        });
      }
    },
    [dispatch],
  );

  const handleDelete = useCallback(
    async (protocol: StoredProtocolRow) => {
      const confirmed = await dispatch(
        openDialog({
          type: 'Warning',
          title: 'Delete protocol?',
          message: `"${protocol.name}" and its assets will be permanently removed from this device. This cannot be undone.`,
          confirmLabel: 'Delete',
          cancelLabel: 'Cancel',
          canCancel: true,
        }),
      ).unwrap();

      if (!confirmed) {
        return;
      }

      try {
        await dispatch(deleteLibraryProtocol(protocol.id)).unwrap();
      } catch (error) {
        void dispatch(
          openDialog({
            type: 'Error',
            title: 'Delete failed',
            message: `"${protocol.name}" could not be deleted.`,
            error: error instanceof Error ? error : String(error),
          }),
        );
      }
    },
    [dispatch],
  );

  const handleShowInfo = useCallback(async (protocol: StoredProtocolRow) => {
    const { codebook } = protocol.protocol;
    const assetCount = await getProtocolAssetCount(protocol.id);
    const stats: MetaStat[] = [
      { label: 'Stages', value: String(protocol.protocol.stages.length) },
      {
        label: 'Node types',
        value: String(Object.keys(codebook.node ?? {}).length),
      },
      {
        label: 'Edge types',
        value: String(Object.keys(codebook.edge ?? {}).length),
      },
      { label: 'Assets', value: String(assetCount) },
      { label: 'Added', value: formatTimestamp(protocol.createdAt) },
      { label: 'Edited', value: formatTimestamp(protocol.updatedAt) },
    ];
    setInfo({
      title: protocol.name,
      description: protocol.protocol.description,
      stats,
    });
    setInfoOpen(true);
  }, []);

  // Templates aren't stored in the library, so build their info from the
  // in-memory protocol object rather than the asset DB. This surfaces the
  // template's full title and (rich) description, which the truncated row can't.
  const handleShowTemplateInfo = useCallback((template: BundledTemplate) => {
    const { protocol } = template;
    const stats: MetaStat[] = [
      { label: 'Stages', value: String(protocol.stages.length) },
      {
        label: 'Node types',
        value: String(Object.keys(protocol.codebook.node ?? {}).length),
      },
      {
        label: 'Edge types',
        value: String(Object.keys(protocol.codebook.edge ?? {}).length),
      },
    ];
    setInfo({
      title: protocol.name ?? template.name,
      description: protocol.description ?? template.description,
      stats,
    });
    setInfoOpen(true);
  }, []);

  const handleShowStorageInfo = useCallback(() => {
    void dispatch(
      openDialog({
        type: 'Notice',
        title: 'Protocol Storage',
        message: (
          <>
            <p>
              Your protocols are saved only in this browser, on this device.
              They are never uploaded to a server.
            </p>
            <p>
              Because your work lives in this browser's storage, clearing your
              browsing data, or using "Clear all protocols", will permanently
              remove it. Download the protocol as a <code>.netcanvas</code> file
              to save a copy or move it to another device. See our guide to{' '}
              <ExternalLink href={documentationLinks.savingAndBackingUp}>
                saving and backing up your work
              </ExternalLink>{' '}
              for more.
            </p>
            <p>
              Looking for inspiration? Browse example research protocols in the{' '}
              <ExternalLink href={documentationLinks.protocolGallery}>
                Protocol Gallery
              </ExternalLink>
              .
            </p>
          </>
        ),
      }),
    );
  }, [dispatch]);

  const handleClearAll = useCallback(async () => {
    const confirmed = await dispatch(
      openDialog({
        type: 'Warning',
        title: 'Remove all data?',
        message:
          'Every protocol, asset, and saved setting stored in this browser will be permanently removed. This cannot be undone.',
        confirmLabel: 'Remove all',
        cancelLabel: 'Cancel',
        canCancel: true,
      }),
    ).unwrap();

    if (!confirmed) {
      return;
    }

    try {
      await clearAllStorage();
    } catch (error) {
      void dispatch(
        openDialog({
          type: 'Error',
          title: 'Could not remove data',
          message: 'The stored data could not be removed from this browser.',
          error: error instanceof Error ? error : String(error),
        }),
      );
    }
  }, [dispatch]);

  const templateCount = (import.meta.env.DEV ? 2 : 1) + templates.length;
  const templateLabel = `${templateCount} ${templateCount === 1 ? 'template' : 'templates'}`;
  const protocolCount = protocols.length;
  const storageTooltip =
    protocolCount === 1
      ? 'Your 1 protocol is saved only in this browser, on this device. It is never uploaded to a server.'
      : `Your ${protocolCount} protocols are saved only in this browser, on this device. They are never uploaded to a server.`;

  return (
    <>
      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          if (value === 'recent' || value === 'templates') {
            setTab(value);
          }
        }}
        className="bg-surface-1 text-surface-1-foreground flex max-h-[85dvh] w-full max-w-2xl flex-col overflow-hidden rounded shadow-md"
      >
        <div className="flex shrink-0 items-center px-(--space-lg) py-(--space-md)">
          <TabsList>
            <TabsTab value="recent">Recent</TabsTab>
            <TabsTab value="templates">Templates</TabsTab>
          </TabsList>
          {activeTab === 'recent' ? (
            <div className="ml-auto flex h-8 items-center gap-(--space-sm)">
              <Badge color="platinum" className="shadow-none">
                {protocolCount} {protocolCount === 1 ? 'protocol' : 'protocols'}
              </Badge>
              <Tooltip content={storageTooltip} side="bottom">
                <IconButton
                  variant="text"
                  size="small"
                  aria-label="Where your protocols are stored"
                  onClick={handleShowStorageInfo}
                  icon={<Info />}
                />
              </Tooltip>
              <Tooltip
                content="Clear all protocols from this browser"
                side="bottom"
              >
                <IconButton
                  variant="text"
                  size="small"
                  aria-label="Clear all protocols from this browser"
                  onClick={() => void handleClearAll()}
                  icon={<Trash2 />}
                />
              </Tooltip>
            </div>
          ) : (
            <div className="ml-auto flex h-8 items-center">
              <Badge color="platinum" className="shadow-none">
                {templateLabel}
              </Badge>
            </div>
          )}
        </div>

        <TabsPanel value="recent" className={PANEL_CLASSES}>
          {protocols.length === 0 ? (
            <p className="text-muted-foreground px-(--space-md) py-(--space-xl) text-center text-sm">
              No recent protocols yet.
            </p>
          ) : (
            protocols.map((protocol) => (
              <PanelRow
                key={protocol.id}
                name={protocol.name}
                meta={formatProtocolMeta(protocol)}
                downloading={downloadingIds.has(protocol.id)}
                onOpen={() => onOpenProtocol(protocol.id)}
                onDownload={() => handleDownload(protocol)}
                onDelete={() => handleDelete(protocol)}
                onShowInfo={() => handleShowInfo(protocol)}
              />
            ))
          )}
        </TabsPanel>

        <TabsPanel value="templates" className={PANEL_CLASSES}>
          <PanelRow
            name="Sample Protocol"
            description="First time? Explore a sample protocol"
            onOpen={onOpenSample}
          />
          {import.meta.env.DEV && (
            <PanelRow
              name="Development Protocol"
              description="Includes examples of every stage type"
              onOpen={onOpenDevProtocol}
            />
          )}
          {templates.map((template) => (
            <PanelRow
              key={template.id}
              name={template.name}
              description={template.description}
              onOpen={() => onOpenTemplate(template)}
              onShowInfo={() => handleShowTemplateInfo(template)}
            />
          ))}
        </TabsPanel>
      </Tabs>

      <Dialog
        open={infoOpen}
        onOpenChange={setInfoOpen}
        title={info?.title ?? ''}
        cancelText="Close"
      >
        {info && (
          <div className="flex flex-col gap-(--space-md)">
            <p className="whitespace-pre-wrap">
              {info.description?.trim() || 'This protocol has no description.'}
            </p>
            <div className="flex flex-col overflow-hidden rounded">
              <Table
                columns={[
                  { Header: 'Property', accessor: 'label' },
                  { Header: 'Value', accessor: 'value' },
                ]}
                data={info.stats}
              />
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
};

export default LibraryPanel;
