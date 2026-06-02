import { Download, Info, Loader2, Plus, Trash2 } from 'lucide-react';
import { DateTime } from 'luxon';
import { useCallback, useEffect, useState } from 'react';

import { Pattern } from '@codaco/art';
import Badge from '~/components/Badge';
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
import Button, { IconButton } from '~/lib/legacy-ui/components/Button';
import { clearAllStorage, type StoredProtocolRow } from '~/utils/assetDB';
import { downloadProtocolAsNetcanvas } from '~/utils/bundleProtocol';
import { cx } from '~/utils/cva';

type Tab = 'recent' | 'templates';

const withStop =
  (handler: () => void | Promise<void>) => (event: React.MouseEvent) => {
    event.stopPropagation();
    // Handlers may be async; swallow rejections so they don't become unhandled
    // promise rejections (each handler surfaces its own user-facing errors).
    void Promise.resolve(handler()).catch((error: unknown) => {
      console.error('LibraryPanel action failed', error);
    });
  };

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

const formatProtocolMeta = (protocol: StoredProtocolRow): MetaStat[] => {
  return [
    { label: 'Added', value: formatTimestamp(protocol.createdAt) },
    { label: 'Edited', value: formatTimestamp(protocol.updatedAt) },
    { label: 'Stages', value: String(protocol.protocol.stages.length) },
  ];
};

type PanelRowProps = {
  name: string;
  description?: string;
  meta?: MetaStat[];
  downloading?: boolean;
  actionLabel?: string;
  onOpen: () => void;
  onDownload?: () => void;
  onDelete?: () => void;
};

const PanelRow = ({
  name,
  description,
  meta,
  downloading = false,
  actionLabel,
  onOpen,
  onDownload,
  onDelete,
}: PanelRowProps) => {
  const handleKeyDown = (event: React.KeyboardEvent) => {
    // Ignore keys on the inner action buttons so they don't also open the row.
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      className="group focusable relative flex w-full shrink-0 cursor-pointer items-center gap-(--space-sm) overflow-hidden rounded-sm px-(--space-lg) py-(--space-md) text-left text-white shadow-sm transition-shadow hover:shadow-md"
    >
      <Pattern aria-hidden seed={name} className="absolute inset-0 size-full" />

      <span className="relative min-w-0 flex-1">
        <span className="h4 my-0 block truncate leading-tight">{name}</span>
        {meta ? (
          <span className="mt-(--space-xs) grid grid-cols-3 gap-x-(--space-md) gap-y-(--space-xs)">
            {meta.map((stat) => (
              <span key={stat.label} className="flex min-w-0 flex-col">
                <span className="text-xs leading-tight font-semibold tracking-wider text-white/70 uppercase">
                  {stat.label}
                </span>
                <span className="truncate text-sm text-white/80">
                  {stat.value}
                </span>
              </span>
            ))}
          </span>
        ) : (
          description && (
            <span className="mt-(--space-xs) block truncate text-sm text-white/80">
              {description}
            </span>
          )
        )}
      </span>

      {(onDownload || onDelete || actionLabel) && (
        <span
          className={cx(
            'relative flex shrink-0 items-center gap-(--space-xs) transition-all duration-200 ease-out',
            downloading
              ? 'translate-x-0 opacity-100'
              : 'translate-x-2 opacity-0 group-focus-within:translate-x-0 group-focus-within:opacity-100 group-hover:translate-x-0 group-hover:opacity-100',
          )}
        >
          {actionLabel && (
            <Button
              variant="text"
              size="small"
              icon={<Plus />}
              content={actionLabel}
              className="text-white"
              onClick={withStop(onOpen)}
            />
          )}
          {onDownload && (
            <IconButton
              variant="text"
              className="text-white"
              aria-label={
                downloading ? `Downloading ${name}` : `Download ${name}`
              }
              disabled={downloading}
              onClick={withStop(onDownload)}
              icon={
                downloading ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Download />
                )
              }
            />
          )}
          {onDelete && (
            <IconButton
              variant="text"
              className="text-white"
              aria-label={`Delete ${name}`}
              onClick={withStop(onDelete)}
              icon={<Trash2 />}
            />
          )}
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
};

const PANEL_CLASSES =
  'flex h-[min(13rem,50dvh)] flex-col gap-(--space-sm) overflow-y-auto px-(--space-sm) pb-(--space-xl)';

const LibraryPanel = ({
  onOpenProtocol,
  onOpenSample,
  onOpenDevProtocol,
}: LibraryPanelProps) => {
  const dispatch = useAppDispatch();
  const { protocols, isLoaded } = useProtocolLibrary();
  // null until the user picks a tab; the default is chosen once the library has
  // loaded (Templates when there are no recents, Recent otherwise).
  const [tab, setTab] = useState<Tab | null>(null);
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());

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
              to save a copy or move it to another device.
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

  const templateCount = import.meta.env.DEV ? 2 : 1;
  const templateLabel = `${templateCount} ${templateCount === 1 ? 'template' : 'templates'}`;
  const protocolCount = protocols.length;
  const storageTooltip =
    protocolCount === 1
      ? 'Your 1 protocol is saved only in this browser, on this device. It is never uploaded to a server.'
      : `Your ${protocolCount} protocols are saved only in this browser, on this device. They are never uploaded to a server.`;

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => {
        if (value === 'recent' || value === 'templates') {
          setTab(value);
        }
      }}
      className="bg-surface-1 text-surface-1-foreground flex max-h-[85dvh] w-full max-w-xl flex-col overflow-hidden rounded shadow-md"
    >
      <div className="flex shrink-0 items-center px-(--space-lg) py-(--space-md)">
        <TabsList>
          <TabsTab value="recent">Recent</TabsTab>
          <TabsTab value="templates">Templates</TabsTab>
        </TabsList>
        {activeTab === 'recent' ? (
          <div className="ml-auto flex items-center gap-(--space-sm)">
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
          <Badge color="platinum" className="ml-auto shadow-none">
            {templateLabel}
          </Badge>
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
            />
          ))
        )}
      </TabsPanel>

      <TabsPanel value="templates" className={PANEL_CLASSES}>
        <PanelRow
          name="Sample Protocol"
          description="First time? Explore a sample protocol"
          actionLabel="Use this template"
          onOpen={onOpenSample}
        />
        {import.meta.env.DEV && (
          <PanelRow
            name="Development Protocol"
            description="Includes examples of every stage type"
            actionLabel="Use this template"
            onOpen={onOpenDevProtocol}
          />
        )}
      </TabsPanel>
    </Tabs>
  );
};

export default LibraryPanel;
